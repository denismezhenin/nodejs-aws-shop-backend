import { App } from "aws-cdk-lib";
import { AWS_REGION } from "../src/const/consts";
import { ImportServiceStack } from "./import-service-stack";
import { ProductServiceStack } from "./product-service-stack";

const app = new App();

new ProductServiceStack(app, "ProductServiceStack", {
  env: { region: AWS_REGION },
});

new ImportServiceStack(app, "ImportServiceStack", {
  env: { region: AWS_REGION },
});
