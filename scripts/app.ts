import { App } from "aws-cdk-lib";
import { AWS_REGION } from "../src/const/consts";
import { AuthorizationServiceStack } from "./authorization-service-stack";
import { CartServiceStack } from "./cart-service-stack";
import { ImportServiceStack } from "./import-service-stack";
import { ProductServiceStack } from "./product-service-stack";

const app = new App();

const productStack = new ProductServiceStack(app, "ProductServiceStack", {
  env: { region: AWS_REGION },
});

const authStack = new AuthorizationServiceStack(
  app,
  "AuthorizationServiceStack",
  { env: { region: AWS_REGION } }
);

new ImportServiceStack(app, "ImportServiceStack", {
  env: { region: AWS_REGION },
  catalogItemsQueue: productStack.catalogItemsQueue,
  basicAuthorizerFnArn: authStack.basicAuthorizerFn.functionArn,
});

new CartServiceStack(app, "CartServiceStack", {
  env: {
    region: AWS_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
