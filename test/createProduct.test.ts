import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/product_service/createProduct";
import { makeEvent } from "./helpers";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

function postEvent(body: unknown): Parameters<typeof handler>[0] {
  return makeEvent({
    httpMethod: "POST",
    path: "/products",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("createProduct handler", () => {
  it("creates a product + stock atomically and returns 201", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(
      postEvent({
        title: "  New Item  ",
        description: "desc",
        price: 50,
        count: 3,
      }),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(201);
    
    const body = JSON.parse(result!.body);

    expect(body).toMatchObject({
      title: "New Item",
      description: "desc",
      price: 50,
      count: 3,
    });

    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);

    const calls = ddbMock.commandCalls(TransactWriteCommand);

    expect(calls).toHaveLength(1);

    const items = calls[0].args[0].input.TransactItems!;

    expect(items).toHaveLength(2);
    expect(items[0].Put?.TableName).toBe("products");
    expect(items[0].Put?.Item).toMatchObject({
      id: body.id,
      title: "New Item",
      description: "desc",
      price: 50,
    });
    expect(items[1].Put?.TableName).toBe("stocks");
    expect(items[1].Put?.Item).toMatchObject({
      product_id: body.id,
      count: 3,
    });
  });

  it("defaults description to empty string when omitted", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(
      postEvent({ title: "X", price: 1, count: 1 }),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).description).toBe("");
  });

  it("returns 400 on malformed JSON body", async () => {
    const result = await handler(
      postEvent("{not json"),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body)).toEqual({ message: "Invalid JSON body" });
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it("returns 400 when title is empty", async () => {
    const result = await handler(
      postEvent({ title: "   ", price: 10, count: 1 }),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/title/);
  });

  it("returns 400 when price is negative", async () => {
    const result = await handler(
      postEvent({ title: "X", price: -1, count: 1 }),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/price/);
  });

  it("returns 400 when count is non-integer", async () => {
    const result = await handler(
      postEvent({ title: "X", price: 10, count: 1.5 }),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/count/);
  });

  it("returns 500 when TransactWrite fails", async () => {
    ddbMock.on(TransactWriteCommand).rejects(new Error("boom"));

    const result = await handler(
      postEvent({ title: "X", price: 10, count: 1 }),
      {} as Context,
      () => {}
    );

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body)).toEqual({
      message: "Internal server error",
    });
  });
});
