import { jest } from "@jest/globals";
import { Context } from "aws-lambda";
import { makeEvent } from "./helpers";

jest.unstable_mockModule("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
const { handler } = await import("../src/import_service/importProductsFile");
const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

beforeEach(() => {
  mockedGetSignedUrl.mockReset();
});

function importEvent(name?: string): Parameters<typeof handler>[0] {
  return makeEvent({
    httpMethod: "GET",
    path: "/import",
    queryStringParameters: name === undefined ? null : { name },
  });
}

describe("importProductsFile handler", () => {
  it("returns 200 with the presigned URL as a plain-text body", async () => {
    const signed = "https://s3.amazonaws.com/uploaded-shop-data/uploaded/test.csv?signed";
    mockedGetSignedUrl.mockResolvedValueOnce(signed);

    const result = await handler(importEvent("test.csv"), {} as Context, () => {});

    expect(result!.statusCode).toBe(200);
    expect(result!.body).toBe(signed);
    expect(result!.headers!["Content-Type"]).toBe("text/plain");
    expect(result!.headers!["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("builds the PutObjectCommand for uploaded/<name>", async () => {
    mockedGetSignedUrl.mockResolvedValueOnce("https://example.com/x");

    await handler(importEvent("my file.csv"), {} as Context, () => {});

    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    const [, command] = mockedGetSignedUrl.mock.calls[0];
    const input = (command as { input: { Bucket?: string; Key?: string } }).input;
    expect(input.Bucket).toBe("uploaded-shop-data");
    expect(input.Key).toBe("uploaded/my file.csv");
  });

  it("returns 400 when name query parameter is missing", async () => {
    const result = await handler(importEvent(), {} as Context, () => {});

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body)).toEqual({
      message: "Query parameter 'name' is required",
    });
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 500 when the presigner fails", async () => {
    mockedGetSignedUrl.mockRejectedValueOnce(new Error("boom"));

    const result = await handler(importEvent("test.csv"), {} as Context, () => {});

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body)).toEqual({ message: "Internal server error" });
  });
});
