import { randomUUID } from "node:crypto";
import { APIGatewayProxyHandler } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../db/dynamoClient";
import { buildResponse } from "../utils/responses";
import { logRequest } from "../utils/logging";
import { validateCreateProductInput } from "../utils/validation";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../const/consts";

export const handler: APIGatewayProxyHandler = async (event) => {
  logRequest(event);

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body ?? "");
  } catch {
    return buildResponse(400, { message: "Invalid JSON body" });
  }

  const result = validateCreateProductInput(parsed);
  if (!result.ok) {
    return buildResponse(400, { message: result.error });
  }

  const { title, description, price, count } = result.value;
  const id = randomUUID();
  const productItem = {
    id,
    title,
    description: description ?? "",
    price,
  };
  const stockItem = { product_id: id, count };

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: AWS_PRODUCTS_TABLE,
              Item: productItem,
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
          {
            Put: {
              TableName: AWS_STOCKS_TABLE,
              Item: stockItem,
              ConditionExpression: "attribute_not_exists(product_id)",
            },
          },
        ],
      })
    );

    return buildResponse(201, { ...productItem, count });
  } catch (err) {
    console.error("createProduct error", err);
    return buildResponse(500, { message: "Internal server error" });
  }
};
