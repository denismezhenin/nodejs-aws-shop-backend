import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
  APIGatewayTokenAuthorizerHandler,
  PolicyDocument,
} from "aws-lambda";

const BASIC_PREFIX = "Basic "

const buildPolicy = (
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string
): APIGatewayAuthorizerResult => {
  const policyDocument: PolicyDocument = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resource,
      },
    ],
  };
  return { principalId, policyDocument };
};

export const handler: APIGatewayTokenAuthorizerHandler = async (
  event: APIGatewayTokenAuthorizerEvent
) => {
  console.log("basicAuthorizer event", JSON.stringify(event));

  const token = event.authorizationToken;

  if (!token) {
    throw new Error("Unauthorized");
  }

  if (!token.startsWith(BASIC_PREFIX)) {
    return buildPolicy("user", "Deny", event.methodArn);
  }

  const encoded = token.slice(BASIC_PREFIX.length).trim();
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");

  const sepIdx = decoded.indexOf(":");

  if (sepIdx === -1) {
    return buildPolicy("user", "Deny", event.methodArn);
  }

  const login = decoded.slice(0, sepIdx);
  const password = decoded.slice(sepIdx + 1);
  const expected = process.env[login];

  const effect = expected !== undefined && expected === password ? "Allow" : "Deny";
  
  return buildPolicy(login || "user", effect, event.methodArn);
};
