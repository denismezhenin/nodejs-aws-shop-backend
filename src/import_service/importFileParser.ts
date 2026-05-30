import { S3Handler } from "aws-lambda";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import csvParser from "csv-parser";
import { s3 } from "../utils/s3Client";
import { IMPORT_PARSED_PREFIX, IMPORT_UPLOAD_PREFIX } from "../const/consts";

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!srcKey.startsWith(IMPORT_UPLOAD_PREFIX)) {
      console.log(`Skipping ${srcKey} — outside ${IMPORT_UPLOAD_PREFIX}`);
      continue;
    }

    console.log(`Parsing s3://${bucket}/${srcKey}`);

    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: srcKey })
    );
    const body = obj.Body as Readable | undefined;

    if (!body) {
      throw new Error(`Empty body for s3://${bucket}/${srcKey}`);
    }

    await new Promise<void>((resolve, reject) => {
      body.on("error", reject);
      body
        .pipe(csvParser())
        .on("data", (row) => console.log("csv record:", row))
        .on("error", reject)
        .on("end", resolve);
    });

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
