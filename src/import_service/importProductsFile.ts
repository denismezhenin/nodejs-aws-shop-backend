import { APIGatewayProxyHandler } from "aws-lambda";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../utils/s3Client";
import { CORS_HEADERS, buildResponse } from "../utils/responses";
import { logRequest } from "../utils/logging";
import { AWS_IMPORT_BUCKET, IMPORT_UPLOAD_PREFIX } from "../const/consts";

const SIGNED_URL_TTL_SECONDS = 60;

export const handler: APIGatewayProxyHandler = async (event) => {
  logRequest(event);

  const name = event.queryStringParameters?.name;
  if (!name) {
    return buildResponse(400, { message: "Query parameter 'name' is required" });
  }

  try {
    const command = new PutObjectCommand({
      Bucket: AWS_IMPORT_BUCKET,
      Key: `${IMPORT_UPLOAD_PREFIX}${name}`,
    });
    const url = await getSignedUrl(s3, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain" },
      body: url,
    };
  } catch (err) {
    console.error("importProductsFile error", err);
    return buildResponse(500, { message: "Internal server error" });
  }
};
