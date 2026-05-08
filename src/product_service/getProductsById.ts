import { APIGatewayProxyHandler } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../db/dynamoClient";
import { ProductRecord, StockRecord } from "../types/product";
import { buildResponse } from "../utils/responses";
import { logRequest } from "../utils/logging";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../const/consts";

export const handler: APIGatewayProxyHandler = async (event) => {
  logRequest(event);

  const productId = event.pathParameters?.productId;
  if (!productId) {
    return buildResponse(400, { message: "productId is required" });
  }

  try {
    const [productRes, stockRes] = await Promise.all([
      ddb.send(
        new GetCommand({ TableName: AWS_PRODUCTS_TABLE, Key: { id: productId } })
      ),
      ddb.send(
        new GetCommand({
          TableName: AWS_STOCKS_TABLE,
          Key: { product_id: productId },
        })
      ),
    ]);

    if (!productRes.Item) {
      return buildResponse(404, { message: "Product not found" });
    }

    const product = productRes.Item as ProductRecord;
    const stock = stockRes.Item as StockRecord | undefined;

    return buildResponse(200, { ...product, count: stock?.count ?? 0 });
  } catch (err) {
    console.error("getProductsById error", err);
    return buildResponse(500, { message: "Internal server error" });
  }
};
