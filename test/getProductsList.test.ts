import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/product_service/getProductsList";
import { makeEvent } from "./helpers";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("getProductsList handler", () => {
  it("returns 200 with products joined with stock counts", async () => {
    ddbMock
      .on(ScanCommand, { TableName: "products" })
      .resolves({
        Items: [
          { id: "p1", title: "A", description: "x", price: 10 },
          { id: "p2", title: "B", description: "y", price: 20 },
        ],
      });
    ddbMock
      .on(ScanCommand, { TableName: "stocks" })
      .resolves({
        Items: [
          { product_id: "p1", count: 5 },
          { product_id: "p2", count: 8 },
        ],
      });

    const result = await handler(makeEvent(), {} as Context, () => {});

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toEqual([
      { id: "p1", title: "A", description: "x", price: 10, count: 5 },
      { id: "p2", title: "B", description: "y", price: 20, count: 8 },
    ]);
  });

  it("defaults count to 0 when no stock row exists for a product", async () => {
    ddbMock
      .on(ScanCommand, { TableName: "products" })
      .resolves({
        Items: [{ id: "p1", title: "A", description: "x", price: 10 }],
      });
    ddbMock.on(ScanCommand, { TableName: "stocks" }).resolves({ Items: [] });

    const result = await handler(makeEvent(), {} as Context, () => {});

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([
      { id: "p1", title: "A", description: "x", price: 10, count: 0 },
    ]);
  });

  it("returns 500 when DynamoDB scan fails", async () => {
    ddbMock.on(ScanCommand).rejects(new Error("boom"));

    const result = await handler(makeEvent(), {} as Context, () => {});

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body)).toEqual({
      message: "Internal server error",
    });
  });

  it("returns CORS headers", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const result = await handler(makeEvent(), {} as Context, () => {});
    expect(result!.headers!["Access-Control-Allow-Origin"]).toBe("*");
    expect(result!.headers!["Content-Type"]).toBe("application/json");
  });
});
