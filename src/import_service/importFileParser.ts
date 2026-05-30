import { S3Handler } from "aws-lambda";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import csvParser from "csv-parser";
import { s3 } from "../utils/s3Client";
import { sqs } from "../utils/sqsClient";
import { IMPORT_PARSED_PREFIX, IMPORT_UPLOAD_PREFIX } from "../const/consts";

const SQS_BATCH_SIZE = 10;

export const handler: S3Handler = async (event) => {
  const queueUrl = process.env.CATALOG_ITEMS_QUEUE_URL;

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!srcKey.startsWith(IMPORT_UPLOAD_PREFIX)) {
      console.log(`Skipping ${srcKey} — outside ${IMPORT_UPLOAD_PREFIX}`);
      continue;
    }

    if (!queueUrl) {
      throw new Error("CATALOG_ITEMS_QUEUE_URL env var is not set");
    }

    console.log(`Parsing s3://${bucket}/${srcKey}`);

    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: srcKey })
    );
    const body = obj.Body as Readable | undefined;

    if (!body) {
      throw new Error(`Empty body for s3://${bucket}/${srcKey}`);
    }

    const rows: Record<string, unknown>[] = [];

    await new Promise<void>((resolve, reject) => {
      body.on("error", reject);
      body
        .pipe(csvParser())
        .on("data", (row: Record<string, unknown>) => rows.push(row))
        .on("error", reject)
        .on("end", resolve);
    });

    for (let i = 0; i < rows.length; i += SQS_BATCH_SIZE) {
      const chunk = rows.slice(i, i + SQS_BATCH_SIZE);
      await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: chunk.map((row, idx) => ({
            Id: String(i + idx),
            MessageBody: JSON.stringify(row),
          })),
        })
      );
    }

    const dstKey = IMPORT_PARSED_PREFIX + srcKey.slice(IMPORT_UPLOAD_PREFIX.length);
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${srcKey}`,
        Key: dstKey,
      })
    );
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: srcKey }));

    console.log(`Moved s3://${bucket}/${srcKey} -> s3://${bucket}/${dstKey}`);
  }
};
