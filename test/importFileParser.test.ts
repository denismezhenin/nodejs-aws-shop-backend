import { jest } from "@jest/globals";
import { Context, S3Event } from "aws-lambda";
import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

import { handler } from "../src/import_service/importFileParser";

const QUEUE_URL = "https://sqs.eu-central-1.amazonaws.com/123456789012/catalogItemsQueue";

const s3Mock = mockClient(S3Client);
const sqsMock = mockClient(SQSClient);

beforeEach(() => {
  s3Mock.reset();
  sqsMock.reset();
  process.env.CATALOG_ITEMS_QUEUE_URL = QUEUE_URL;
});

function s3Event(bucket: string, key: string): S3Event {
  return {
    Records: [
      {
        eventName: "ObjectCreated:Put",
        s3: {
          bucket: { name: bucket, arn: "", ownerIdentity: { principalId: "" } },
          object: {
            key,
            size: 0,
            eTag: "",
            sequencer: "",
          },
          configurationId: "",
          s3SchemaVersion: "",
        },
      } as unknown as S3Event["Records"][number],
    ],
  };
}

describe("importFileParser handler", () => {
  it("parses CSV rows, pushes them to SQS, then copies and deletes the source", async () => {
    const csv = "title,price,count\nA,10,2\nB,20,5\n";
    s3Mock
      .on(GetObjectCommand, { Bucket: "uploaded-shop-data", Key: "uploaded/x.csv" })
      .resolves({ Body: Readable.from(csv) as never });
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
    sqsMock.on(SendMessageBatchCommand).resolves({ Successful: [], Failed: [] });

    await handler(
      s3Event("uploaded-shop-data", "uploaded/x.csv"),
      {} as Context,
      () => {}
    );

    const sqsCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sqsCalls).toHaveLength(1);
    const input = sqsCalls[0].args[0].input;
    expect(input.QueueUrl).toBe(QUEUE_URL);
    expect(input.Entries).toHaveLength(2);
    expect(JSON.parse(input.Entries![0].MessageBody!)).toEqual({
      title: "A",
      price: "10",
      count: "2",
    });
    expect(JSON.parse(input.Entries![1].MessageBody!)).toEqual({
      title: "B",
      price: "20",
      count: "5",
    });

    const copyCalls = s3Mock.commandCalls(CopyObjectCommand);
    expect(copyCalls).toHaveLength(1);
    expect(copyCalls[0].args[0].input).toMatchObject({
      Bucket: "uploaded-shop-data",
      CopySource: "uploaded-shop-data/uploaded/x.csv",
      Key: "parsed/x.csv",
    });

    const deleteCalls = s3Mock.commandCalls(DeleteObjectCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input).toMatchObject({
      Bucket: "uploaded-shop-data",
      Key: "uploaded/x.csv",
    });
  });

  it("chunks rows into batches of 10 (SQS hard limit)", async () => {
    const header = "title,price,count\n";
    const rows = Array.from({ length: 23 }, (_, i) => `T${i},1,1`).join("\n");
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: Readable.from(header + rows + "\n") as never });
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
    sqsMock.on(SendMessageBatchCommand).resolves({ Successful: [], Failed: [] });

    await handler(
      s3Event("uploaded-shop-data", "uploaded/many.csv"),
      {} as Context,
      () => {}
    );

    const sqsCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sqsCalls).toHaveLength(3);
    expect(sqsCalls[0].args[0].input.Entries).toHaveLength(10);
    expect(sqsCalls[1].args[0].input.Entries).toHaveLength(10);
    expect(sqsCalls[2].args[0].input.Entries).toHaveLength(3);
  });

  it("decodes URL-encoded keys from the S3 event", async () => {
    const csv = "title\nA\n";
    s3Mock
      .on(GetObjectCommand, { Key: "uploaded/my file.csv" })
      .resolves({ Body: Readable.from(csv) as never });
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
    sqsMock.on(SendMessageBatchCommand).resolves({ Successful: [], Failed: [] });

    await handler(
      s3Event("uploaded-shop-data", "uploaded/my+file.csv"),
      {} as Context,
      () => {}
    );

    const getCalls = s3Mock.commandCalls(GetObjectCommand);
    expect(getCalls[0].args[0].input.Key).toBe("uploaded/my file.csv");
  });

  it("skips records outside the uploaded/ prefix", async () => {
    await handler(
      s3Event("uploaded-shop-data", "other/x.csv"),
      {} as Context,
      () => {}
    );

    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
    expect(sqsMock.commandCalls(SendMessageBatchCommand)).toHaveLength(0);
  });

  it("does not copy, delete, or push to SQS when the stream errors", async () => {
    const broken = new Readable({
      read() {
        process.nextTick(() => this.destroy(new Error("stream boom")));
      },
    });
    s3Mock.on(GetObjectCommand).resolves({ Body: broken as never });

    await expect(
      handler(
        s3Event("uploaded-shop-data", "uploaded/x.csv"),
        {} as Context,
        () => {}
      )
    ).rejects.toThrow("stream boom");

    expect(sqsMock.commandCalls(SendMessageBatchCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });
});
