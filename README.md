# aws-shop-backend

AWS CDK app for the RS School AWS course. Currently contains the **Task 3 — Product Service**: an API Gateway REST API fronting two Lambda functions (`getProductsList`, `getProductsById`) backed by in-memory mock data (electronics catalog).

Deployed at `https://gyl4e2imdk.execute-api.eu-central-1.amazonaws.com/dev` (region `eu-central-1`).

## Endpoints

| Method | Path                     | Lambda             | Description                                                              |
| ------ | ------------------------ | ------------------ | ------------------------------------------------------------------------ |
| GET    | `/products`              | `getProductsList`  | Returns the full array of products                                       |
| GET    | `/products/{productId}`  | `getProductsById`  | Returns one product. `404` if not found, `400` if `productId` is missing |

CORS is open (`Access-Control-Allow-Origin: *`) for `GET` and `OPTIONS`.

## Project layout

```
.
├── scripts/
│   └── product-service-stack.ts   # CDK App + Stack (one file)
├── src/
│   ├── products/
│   │   ├── getProductsList.ts     # Lambda handler
│   │   └── getProductsById.ts     # Lambda handler
│   ├── data/products.ts           # Mock electronics catalog
│   ├── types/product.ts           # Product type
│   └── utils/responses.ts         # buildResponse + CORS_HEADERS
├── test/
│   ├── getProductsList.test.ts
│   ├── getProductsById.test.ts
│   └── helpers.ts
├── openapi.yaml                   # OpenAPI 3.0.3 spec
├── cdk.json
├── jest.config.ts
├── package.json
└── tsconfig.json
```

## Stack / tooling

- **Node.js ≥ 20.11**, `"type": "module"` (native ESM, no CommonJS).
- TypeScript with `module: "ESNext"` + `moduleResolution: "Bundler"` (extensionless imports).
- **CDK v2** (`aws-cdk-lib`) — `RestApi` + `NodejsFunction` (esbuild bundles each handler at synth time).
- **tsx** runs the CDK app entry (replaces `ts-node`'s ESM loader).
- **Jest 29** + **ts-jest** (ESM preset) for unit tests; runs with `NODE_OPTIONS=--experimental-vm-modules`.

## Setup

```bash
npm install
```

## Test

```bash
npm test               # all unit tests
npm run test:coverage  # with coverage report
```

Unit tests cover all handler branches: 200 list, 200 by-id, 404 not found, 400 missing id, plus the CORS header on every response.

## Synthesize (no deploy)

```bash
npm run synth
```

## Deploy

First time per account/region only:

```bash
npm run bootstrap   # cdk bootstrap aws://<account>/eu-central-1
```

Then deploy:

```bash
npm run deploy
```

After deploy, the `ApiBaseUrl` CloudFormation output is the base URL for the API. Example:

```
ProductServiceStack.ApiBaseUrl = https://gyl4e2imdk.execute-api.eu-central-1.amazonaws.com/dev/
```

Drop the trailing slash when pasting into FE config.

## Smoke test

```bash
BASE=https://gyl4e2imdk.execute-api.eu-central-1.amazonaws.com/dev

curl $BASE/products
curl $BASE/products/7567ec4b-b10c-48c5-9345-fc73c48a80aa
curl -i $BASE/products/does-not-exist        # → 404 + {"message":"Product not found"}
curl -i -X OPTIONS $BASE/products \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET"    # → 204 + CORS headers
```

## Swagger / OpenAPI

[`openapi.yaml`](./openapi.yaml) describes both endpoints and the `Product` / `ErrorMessage` schemas. To view, paste the file contents into <https://editor.swagger.io/> and update `servers[0].variables.apiId.default` to the deployed API ID (`gyl4e2imdk`).

## Teardown

```bash
npm run destroy
```
