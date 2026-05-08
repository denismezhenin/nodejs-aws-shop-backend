import { APIGatewayProxyEvent } from "aws-lambda";

export function logRequest(event: APIGatewayProxyEvent): void {
  console.log("Incoming request", {
    method: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
    body: event.body,
  });
}
