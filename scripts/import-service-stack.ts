import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  AuthorizationType,
  Cors,
  IdentitySource,
  LambdaIntegration,
  ResponseType,
  RestApi,
  TokenAuthorizer,
} from "aws-cdk-lib/aws-apigateway";
import { Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import {
  AWS_IMPORT_BUCKET,
  IMPORT_PARSED_PREFIX,
  IMPORT_UPLOAD_PREFIX,
} from "../src/const/consts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ImportServiceStackProps extends StackProps {
  catalogItemsQueue: IQueue;
  basicAuthorizerFnArn: string;
}

export class ImportServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: ImportServiceStackProps) {
    super(scope, id, props);

    const { catalogItemsQueue, basicAuthorizerFnArn } = props;

    // Import the authorizer lambda by ARN so CDK doesn't try to auto-grant
    // invoke permission (which would reference the import API ARN and create
    // a cross-stack cycle). Permission is granted in AuthorizationServiceStack.
    const basicAuthorizerFn = LambdaFunction.fromFunctionArn(
      this,
      "BasicAuthorizerFn",
      basicAuthorizerFnArn
    );

    const bucket = Bucket.fromBucketName(
      this,
      "ImportBucket",
      AWS_IMPORT_BUCKET
    );

    const sharedFnProps = {
      runtime: Runtime.NODEJS_22_X,
      handler: "handler",
      memorySize: 256,
      timeout: Duration.seconds(30),
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022",
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        LOG_LEVEL: "info",
        IMPORT_BUCKET: AWS_IMPORT_BUCKET,
        UPLOAD_PREFIX: IMPORT_UPLOAD_PREFIX,
        PARSED_PREFIX: IMPORT_PARSED_PREFIX,
      },
    };

    const importProductsFileFn = new NodejsFunction(this, "ImportProductsFile", {
      ...sharedFnProps,
      functionName: "importProductsFile",
      entry: path.join(__dirname, "../src/import_service/importProductsFile.ts"),
    });

    const importFileParserFn = new NodejsFunction(this, "ImportFileParser", {
      ...sharedFnProps,
      functionName: "importFileParser",
      entry: path.join(__dirname, "../src/import_service/importFileParser.ts"),
      environment: {
        ...sharedFnProps.environment,
        CATALOG_ITEMS_QUEUE_URL: catalogItemsQueue.queueUrl,
      },
    });

    bucket.grantPut(importProductsFileFn, `${IMPORT_UPLOAD_PREFIX}*`);
    bucket.grantRead(importFileParserFn, `${IMPORT_UPLOAD_PREFIX}*`);
    bucket.grantWrite(importFileParserFn, `${IMPORT_PARSED_PREFIX}*`);
    bucket.grantDelete(importFileParserFn, `${IMPORT_UPLOAD_PREFIX}*`);
    catalogItemsQueue.grantSendMessages(importFileParserFn);

    bucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(importFileParserFn),
      { prefix: IMPORT_UPLOAD_PREFIX }
    );

    const api = new RestApi(this, "ImportServiceApi", {
      restApiName: "Import Service API",
      description: "Import service for aws shop",
      deployOptions: { stageName: "dev" },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const corsResponseHeaders = {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Headers": "'*'",
    };
    api.addGatewayResponse("Unauthorized", {
      type: ResponseType.UNAUTHORIZED,
      statusCode: "401",
      responseHeaders: corsResponseHeaders,
    });
    api.addGatewayResponse("AccessDenied", {
      type: ResponseType.ACCESS_DENIED,
      statusCode: "403",
      responseHeaders: corsResponseHeaders,
    });

    const authorizer = new TokenAuthorizer(this, "BasicTokenAuthorizer", {
      handler: basicAuthorizerFn,
      identitySource: IdentitySource.header("Authorization"),
      resultsCacheTtl: Duration.seconds(0),
    });

    const importResource = api.root.addResource("import");
    importResource.addMethod(
      "GET",
      new LambdaIntegration(importProductsFileFn),
      {
        requestParameters: { "method.request.querystring.name": true },
        authorizationType: AuthorizationType.CUSTOM,
        authorizer,
      }
    );

    new CfnOutput(this, "ImportApiBaseUrl", {
      value: api.url,
      description:
        "Base URL for the Import Service API (paste into FE apiPaths.ts as API_PATHS.import without trailing slash)",
    });

    new CfnOutput(this, "ImportEndpointExample", {
      value: `${api.url}import?name=products.csv`,
      description: "GET /import?name=<filename>",
    });
  }
}
