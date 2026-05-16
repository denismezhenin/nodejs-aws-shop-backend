import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Cors, LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../src/const/consts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


export class ProductServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const productsTable = Table.fromTableName(
      this,
      "ProductsTable",
      AWS_PRODUCTS_TABLE
    );
    const stocksTable = Table.fromTableName(
      this,
      "StocksTable",
      AWS_STOCKS_TABLE
    );

    const sharedFnProps = {
      runtime: Runtime.NODEJS_22_X,
      handler: "handler",
      memorySize: 256,
      timeout: Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022",
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        LOG_LEVEL: "info",
        AWS_PRODUCTS_TABLE,
        AWS_STOCKS_TABLE,
      },
    };

    const getProductsListFn = new NodejsFunction(this, "GetProductsList", {
      ...sharedFnProps,
      functionName: "getProductsList",
      entry: path.join(__dirname, "../src/product_service/getProductsList.ts"),
    });

    const getProductsByIdFn = new NodejsFunction(this, "GetProductsById", {
      ...sharedFnProps,
      functionName: "getProductsById",
      entry: path.join(__dirname, "../src/product_service/getProductsById.ts"),
    });

    const createProductFn = new NodejsFunction(this, "CreateProduct", {
      ...sharedFnProps,
      functionName: "createProduct",
      entry: path.join(__dirname, "../src/product_service/createProduct.ts"),
    });

    productsTable.grantReadData(getProductsListFn);
    stocksTable.grantReadData(getProductsListFn);
    productsTable.grantReadData(getProductsByIdFn);
    stocksTable.grantReadData(getProductsByIdFn);
    productsTable.grantWriteData(createProductFn);
    stocksTable.grantWriteData(createProductFn);

    const api = new RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service API",
      description: "Product service for aws shop",
      deployOptions: { stageName: "dev" },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
      },
    });

    const productsResource = api.root.addResource("products");
    productsResource.addMethod("GET", new LambdaIntegration(getProductsListFn));
    productsResource.addMethod("POST", new LambdaIntegration(createProductFn));

    const productByIdResource = productsResource.addResource("{productId}");
    productByIdResource.addMethod(
      "GET",
      new LambdaIntegration(getProductsByIdFn),
    );

    new CfnOutput(this, "ApiBaseUrl", {
      value: api.url,
      description:
        "Base URL for the Product Service API (paste into FE apiPaths.ts)",
    });

    new CfnOutput(this, "ProductsListUrl", {
      value: `${api.url}products`,
      description: "GET /products",
    });

    new CfnOutput(this, "ProductByIdUrlExample", {
      value: `${api.url}products/7567ec4b-b10c-48c5-9345-fc73c48a80aa`,
      description: "GET /products/{productId} sample URL",
    });

    new CfnOutput(this, "CreateProductUrl", {
      value: `${api.url}products`,
      description: "POST /products",
    });
  }
}
