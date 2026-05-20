import { SNSClient } from "@aws-sdk/client-sns";
import { AWS_REGION } from "../const/consts";

export const sns = new SNSClient({ region: AWS_REGION });
