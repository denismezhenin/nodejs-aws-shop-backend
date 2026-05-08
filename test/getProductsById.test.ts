import { Context } from "aws-lambda";
import { handler } from "../src/product_service/getProductsById";
import { products } from "../src/data/products";
import { makeEvent } from "./helpers";

describe("getProductsById handler", () => {
  it("returns 200 with the matching product when productId exists", async () => {
    const expected = products[0];
    const event = makeEvent({ pathParameters: { productId: expected.id } });

    const result = await handler(event, {} as Context, () => {});

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual(expected);
  });

  it("returns 404 with 'Product not found' when productId is unknown", async () => {
    const event = makeEvent({
      pathParameters: { productId: "does-not-exist" },
    });

    const result = await handler(event, {} as Context, () => {});

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body)).toEqual({
      message: "Product not found",
    });
  });

  it("returns 400 when productId path parameter is missing", async () => {
    const event = makeEvent({ pathParameters: null });

    const result = await handler(event, {} as Context, () => {});

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body)).toEqual({
      message: "productId is required",
    });
  });

  it("returns CORS headers on every response", async () => {
    const event = makeEvent({
      pathParameters: { productId: "does-not-exist" },
    });
    const result = await handler(event, {} as Context, () => {});
    expect(result!.headers!["Access-Control-Allow-Origin"]).toBe("*");
  });
});
