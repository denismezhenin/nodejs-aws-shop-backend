import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Cors, LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { SubscriptionFilter, Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../src/const/consts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRIMARY_NOTIFICATION_EMAIL = "arctik@tut.by";
const HIGH_PRICE_NOTIFICATION_EMAIL = "dzianismiazhenin@gmail.com";
const HIGH_PRICE_THRESHOLD = 100;

export class ProductServiceStack extends Stack {
  public readonly catalogItemsQueue: Queue;

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

    this.catalogItemsQueue = new Queue(this, "CatalogItemsQueue", {
      queueName: "catalogItemsQueue",
      visibilityTimeout: Duration.seconds(60),
    });

    const createProductTopic = new Topic(this, "CreateProductTopic", {
      topicName: "createProductTopic",
      displayName: "New product notifications",
    });

    createProductTopic.addSubscription(
      new EmailSubscription(PRIMARY_NOTIFICATION_EMAIL)
    );

    createProductTopic.addSubscription(
      new EmailSubscription(HIGH_PRICE_NOTIFICATION_EMAIL, {
        filterPolicy: {
          price: SubscriptionFilter.numericFilter({
            greaterThanOrEqualTo: HIGH_PRICE_THRESHOLD,
          }),
        },
      })
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

    const catalogBatchProcessFn = new NodejsFunction(this, "CatalogBatchProcess", {
      ...sharedFnProps,
      functionName: "catalogBatchProcess",
      entry: path.join(
        __dirname,
        "../src/product_service/catalogBatchProcess.ts"
      ),
      environment: {
        ...sharedFnProps.environment,
        CREATE_PRODUCT_TOPIC_ARN: createProductTopic.topicArn,
      },
    });

    catalogBatchProcessFn.addEventSource(
      new SqsEventSource(this.catalogItemsQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      })
    );

    productsTable.grantReadData(getProductsListFn);
    stocksTable.grantReadData(getProductsListFn);
    productsTable.grantReadData(getProductsByIdFn);
    stocksTable.grantReadData(getProductsByIdFn);
    productsTable.grantWriteData(createProductFn);
    stocksTable.grantWriteData(createProductFn);
    productsTable.grantWriteData(catalogBatchProcessFn);
    stocksTable.grantWriteData(catalogBatchProcessFn);
    createProductTopic.grantPublish(catalogBatchProcessFn);

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

    new CfnOutput(this, "CatalogItemsQueueUrl", {
      value: this.catalogItemsQueue.queueUrl,
      description: "URL of the catalogItemsQueue SQS queue",
    });

    new CfnOutput(this, "CreateProductTopicArn", {
      value: createProductTopic.topicArn,
      description: "ARN of the createProductTopic SNS topic",
    });
  }
}
