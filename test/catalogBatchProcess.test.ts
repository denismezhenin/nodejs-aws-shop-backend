import { SQSEvent, SQSRecord } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { handler } from "../src/product_service/catalogBatchProcess";

const TOPIC_ARN = "arn:aws:sns:eu-central-1:123456789012:createProductTopic";

const ddbMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

beforeEach(() => {
  ddbMock.reset();
  snsMock.reset();
  process.env.CREATE_PRODUCT_TOPIC_ARN = TOPIC_ARN;
});

function sqsRecord(body: unknown, messageId = "msg-" + Math.random()): SQSRecord {
  return {
    messageId,
    receiptHandle: "rh",
    body: typeof body === "string" ? body : JSON.stringify(body),
    attributes: {} as SQSRecord["attributes"],
    messageAttributes: {},
    md5OfBody: "",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:eu-central-1:123456789012:catalogItemsQueue",
    awsRegion: "eu-central-1",
  };
}

function sqsEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

describe("catalogBatchProcess handler", () => {
  it("creates products + publishes SNS for every valid record (happy path)", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const event = sqsEvent([
      sqsRecord({ title: "Lamp", description: "LED", price: 69, count: 15 }, "m1"),
      sqsRecord({ title: "Monitor", description: "27in", price: 329, count: 5 }, "m2"),
    ]);

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });

    const ddbCalls = ddbMock.commandCalls(TransactWriteCommand);
    expect(ddbCalls).toHaveLength(2);

    const firstItems = ddbCalls[0].args[0].input.TransactItems!;
    expect(firstItems[0].Put?.TableName).toBe("products");
    expect(firstItems[0].Put?.Item).toMatchObject({
      title: "Lamp",
      description: "LED",
      price: 69,
    });
    expect(firstItems[1].Put?.TableName).toBe("stocks");
    expect(firstItems[1].Put?.Item).toMatchObject({ count: 15 });

    const snsCalls = snsMock.commandCalls(PublishCommand);
    expect(snsCalls).toHaveLength(2);
    expect(snsCalls[0].args[0].input).toMatchObject({
      TopicArn: TOPIC_ARN,
      Subject: "New product created",
    });
    expect(snsCalls[0].args[0].input.MessageAttributes).toEqual({
      price: { DataType: "Number", StringValue: "69" },
    });
    expect(snsCalls[1].args[0].input.MessageAttributes).toEqual({
      price: { DataType: "Number", StringValue: "329" },
    });
    const message0 = JSON.parse(snsCalls[0].args[0].input.Message!);
    expect(message0).toMatchObject({ title: "Lamp", price: 69, count: 15 });
  });

  it("coerces stringified price/count from CSV", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const event = sqsEvent([
      sqsRecord({ title: "X", description: "d", price: "150", count: "3" }),
    ]);

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });
    const ddbCall = ddbMock.commandCalls(TransactWriteCommand)[0];
    expect(ddbCall.args[0].input.TransactItems![0].Put?.Item).toMatchObject({
      price: 150,
    });
    expect(ddbCall.args[0].input.TransactItems![1].Put?.Item).toMatchObject({
      count: 3,
    });
    const snsCall = snsMock.commandCalls(PublishCommand)[0];
    expect(snsCall.args[0].input.MessageAttributes).toEqual({
      price: { DataType: "Number", StringValue: "150" },
    });
  });

  it("reports invalid rows as batch failures but keeps processing siblings", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const event = sqsEvent([
      sqsRecord({ title: "", price: 10, count: 1 }, "bad"),
      sqsRecord({ title: "Ok", price: 10, count: 1 }, "good"),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "bad" }]);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
  });

  it("does not publish SNS when DynamoDB write fails", async () => {
    ddbMock.on(TransactWriteCommand).rejects(new Error("ddb boom"));
    snsMock.on(PublishCommand).resolves({});

    const event = sqsEvent([
      sqsRecord({ title: "X", price: 10, count: 1 }, "m1"),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "m1" }]);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it("reports record as failure when SNS publish fails", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).rejects(new Error("sns boom"));

    const event = sqsEvent([
      sqsRecord({ title: "X", price: 10, count: 1 }, "m1"),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "m1" }]);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it("reports record as failure when body is not valid JSON", async () => {
    const event = sqsEvent([sqsRecord("{not json", "m1")]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "m1" }]);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it("returns empty batchItemFailures for an empty event", async () => {
    const result = await handler(sqsEvent([]));
    expect(result).toEqual({ batchItemFailures: [] });
  });
});
