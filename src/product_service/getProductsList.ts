import { APIGatewayProxyHandler } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb  } from "../db/dynamoClient";
import { Product, ProductRecord, StockRecord } from "../types/product";
import { buildResponse } from "../utils/responses";
import { logRequest } from "../utils/logging";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../const/consts";

export const handler: APIGatewayProxyHandler = async (event) => {
  logRequest(event);
  try {
    const [productsRes, stocksRes] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: AWS_PRODUCTS_TABLE })),
      ddb.send(new ScanCommand({ TableName: AWS_STOCKS_TABLE })),
    ]);

    const products = (productsRes.Items ?? []) as ProductRecord[];
    const stocks = (stocksRes.Items ?? []) as StockRecord[];

    const stockByPid = new Map<string, number>(
      stocks.map((s) => [s.product_id, s.count ?? 0])
    );

    const joined: Product[] = products.map((p) => ({
      ...p,
      count: stockByPid.get(p.id) ?? 0,
    }));

    return buildResponse(200, joined);
  } catch (err) {
    console.error("getProductsList error", err);
    return buildResponse(500, { message: "Internal server error" });
  }
};
