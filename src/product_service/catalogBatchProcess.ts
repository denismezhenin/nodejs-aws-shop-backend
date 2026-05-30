import { randomUUID } from "node:crypto";
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand } from "@aws-sdk/client-sns";
import { ddb } from "../db/dynamoClient";
import { sns } from "../utils/snsClient";
import { validateCsvRow } from "../utils/validation";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../const/consts";

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const topicArn = process.env.CREATE_PRODUCT_TOPIC_ARN;
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const parsed = JSON.parse(record.body);
      const result = validateCsvRow(parsed);
      if (!result.ok) {
        throw new Error(`Invalid CSV row: ${result.error}`);
      }

      const { title, description, price, count } = result.value;
      const id = randomUUID();

      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: AWS_PRODUCTS_TABLE,
                Item: {
                  id,
                  title,
                  description: description ?? "",
                  price,
                },
                ConditionExpression: "attribute_not_exists(id)",
              },
            },
            {
              Put: {
                TableName: AWS_STOCKS_TABLE,
                Item: { product_id: id, count },
                ConditionExpression: "attribute_not_exists(product_id)",
              },
            },
          ],
        })
      );

      if (!topicArn) {
        throw new Error("CREATE_PRODUCT_TOPIC_ARN env var is not set");
      }

      await sns.send(
        new PublishCommand({
          TopicArn: topicArn,
          Subject: "New product created",
          Message: JSON.stringify({ id, title, price, count }),
          MessageAttributes: {
            price: { DataType: "Number", StringValue: String(price) },
          },
        })
      );

      console.log("Created product", { id, title, price, count });
    } catch (err) {
      console.error("catalogBatchProcess record failed", {
        messageId: record.messageId,
        err: err instanceof Error ? err.message : err,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
