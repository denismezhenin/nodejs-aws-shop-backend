import * as path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const buildAuthEnvironment = (): Record<string, string> => {
  const login = process.env.GITHUB_LOGIN;

  if (!login) {
    throw new Error(
      "GITHUB_LOGIN is not set."
    );
  }
  const password = process.env[login];

  if (!password) {
    throw new Error(
      `Missing credentials env var for login "${login}".`
    );
  }

  return { [login]: password };
};

export class AuthorizationServiceStack extends Stack {
  public readonly basicAuthorizerFn: NodejsFunction;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.basicAuthorizerFn = new NodejsFunction(this, "BasicAuthorizer", {
      runtime: Runtime.NODEJS_22_X,
      handler: "handler",
      functionName: "basicAuthorizer",
      memorySize: 128,
      timeout: Duration.seconds(10),
      entry: path.join(
        __dirname,
        "../src/authorization_service/basicAuthorizer.ts"
      ),
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022",
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        LOG_LEVEL: "info",
        ...buildAuthEnvironment(),
      },
    });

    this.basicAuthorizerFn.addPermission("ApiGatewayInvoke", {
      principal: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    new CfnOutput(this, "BasicAuthorizerFnArn", {
      value: this.basicAuthorizerFn.functionArn,
    });
  }
}
