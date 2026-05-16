import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/product_service/getProductsById";
import { makeEvent } from "./helpers";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("getProductsById handler", () => {
  it("returns 200 with the joined product when productId exists", async () => {
    ddbMock
      .on(GetCommand, { TableName: "products", Key: { id: "p1" } })
      .resolves({
        Item: { id: "p1", title: "A", description: "x", price: 10 },
      });
    ddbMock
      .on(GetCommand, { TableName: "stocks", Key: { product_id: "p1" } })
      .resolves({ Item: { product_id: "p1", count: 5 } });

    const event = makeEvent({ pathParameters: { productId: "p1" } });
    const result = await handler(event, {} as Context, () => {});

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      id: "p1",
      title: "A",
      description: "x",
      price: 10,
      count: 5,
    });
  });

  it("defaults count to 0 when stock row is missing", async () => {
    ddbMock
      .on(GetCommand, { TableName: "products", Key: { id: "p1" } })
      .resolves({
        Item: { id: "p1", title: "A", description: "x", price: 10 },
      });
    ddbMock
      .on(GetCommand, { TableName: "stocks", Key: { product_id: "p1" } })
      .resolves({});

    const event = makeEvent({ pathParameters: { productId: "p1" } });
    const result = await handler(event, {} as Context, () => {});

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).count).toBe(0);
  });

  it("returns 404 when productId is unknown", async () => {
    ddbMock.on(GetCommand).resolves({});

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

  it("returns 500 when DynamoDB call fails", async () => {
    ddbMock.on(GetCommand).rejects(new Error("boom"));

    const event = makeEvent({ pathParameters: { productId: "p1" } });
    const result = await handler(event, {} as Context, () => {});

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body)).toEqual({
      message: "Internal server error",
    });
  });

  it("returns CORS headers on every response", async () => {
    ddbMock.on(GetCommand).resolves({});
    const event = makeEvent({
      pathParameters: { productId: "does-not-exist" },
    });
    const result = await handler(event, {} as Context, () => {});
    expect(result!.headers!["Access-Control-Allow-Origin"]).toBe("*");
  });
});
