import { APIGatewayProxyHandler } from "aws-lambda";
import { products } from "../data/products";
import { buildResponse } from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {
  return buildResponse(200, products);
};
