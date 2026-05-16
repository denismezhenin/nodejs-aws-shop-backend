import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AWS_REGION } from "../const/consts";

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: AWS_REGION })
);
