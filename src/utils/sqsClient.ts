import { SQSClient } from "@aws-sdk/client-sqs";
import { AWS_REGION } from "../const/consts";

export const sqs = new SQSClient({ region: AWS_REGION });
