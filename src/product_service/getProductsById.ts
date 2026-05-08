import { APIGatewayProxyHandler } from "aws-lambda";
import { products } from "../data/products";
import { buildResponse } from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {

  const productId = event.pathParameters?.productId;

  if (!productId) {
    return buildResponse(400, { message: "productId is required" });
  }

  const product = products.find((p) => p.id === productId);

  if (!product) {
    return buildResponse(404, { message: "Product not found" });
  }

  return buildResponse(200, product);
};
