import { Context } from "aws-lambda";
import { handler } from "../src/product_service/getProductsList";
import { products } from "../src/data/products";
import { makeEvent } from "./helpers";

describe("getProductsList handler", () => {
  it("returns 200 with the full products array", async () => {
    const result = await handler(makeEvent(), {} as Context, () => {});

    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(products.length);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      description: expect.any(String),
      price: expect.any(Number),
      count: expect.any(Number),
    });
  });

  it("returns CORS headers", async () => {
    const result = await handler(makeEvent(), {} as Context, () => {});
    expect(result!.headers!["Access-Control-Allow-Origin"]).toBe("*");
    expect(result!.headers!["Content-Type"]).toBe("application/json");
  });
});
