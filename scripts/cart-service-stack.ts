import * as path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { CfnOutput, CustomResource, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  CfnSecurityGroupIngress,
  SecurityGroup,
  Subnet,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  FunctionUrlAuthType,
  HttpMethod,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED_ENV = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_SECURITY_GROUP_ID",
  "DB_SUBNET_IDS",
] as const;

const NEST_EXTERNALS = [
  "@aws-sdk/*",
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module",
  "@nestjs/websockets",
  "@nestjs/websockets/socket-module",
  "@nestjs/platform-fastify",
  "@nestjs/mongoose",
  "@nestjs/sequelize",
  "class-transformer/storage",
  // typeorm optional drivers we don't use:
  "mysql",
  "mysql2",
  "oracledb",
  "sqlite3",
  "better-sqlite3",
  "mongodb",
  "mssql",
  "sql.js",
  "redis",
  "ioredis",
  "pg-query-stream",
  "pg-native",
  "hdb-pool",
  "react-native-sqlite-storage",
  "@sap/hana-client",
  "@sap/hana-client/extension/Stream",
  "@google-cloud/spanner",
];

const NEST_NODE_MODULES = ["pg", "typeorm", "reflect-metadata"];

export class CartServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    for (const key of REQUIRED_ENV) {
      if (!process.env[key]) {
        throw new Error(
          `${key} is required in .env to synth CartServiceStack (see sql/seed.sql README)`,
        );
      }
    }

    const dbEnv = {
      DB_HOST: process.env.DB_HOST!,
      DB_PORT: process.env.DB_PORT!,
      DB_NAME: process.env.DB_NAME!,
      DB_USER: process.env.DB_USER!,
      DB_PASSWORD: process.env.DB_PASSWORD!,
      NODE_OPTIONS: "--enable-source-maps",
    };

    const vpc = Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    const subnetIds = process.env.DB_SUBNET_IDS!.split(",").map((s) => s.trim());
    const subnets = subnetIds.map((subnetId, idx) =>
      Subnet.fromSubnetId(this, `DbSubnet${idx}`, subnetId),
    );

    const lambdaSg = new SecurityGroup(this, "CartLambdaSg", {
      vpc,
      allowAllOutbound: true,
      description: "Cart service Lambda egress",
    });

    const rdsSg = SecurityGroup.fromSecurityGroupId(
      this,
      "RdsSg",
      process.env.DB_SECURITY_GROUP_ID!,
      { mutable: true },
    );

    const ingressRule = new CfnSecurityGroupIngress(this, "CartLambdaToRds", {
      groupId: rdsSg.securityGroupId,
      sourceSecurityGroupId: lambdaSg.securityGroupId,
      ipProtocol: "tcp",
      fromPort: Number(process.env.DB_PORT),
      toPort: Number(process.env.DB_PORT),
      description: "Cart Lambda to RDS",
    });

    const tsconfigPath = path.join(__dirname, "../cart-service/tsconfig.json");

    const cartFn = new NodejsFunction(this, "CartApi", {
      functionName: "cart-api",
      runtime: Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "../cart-service/src/lambda.ts"),
      memorySize: 512,
      timeout: Duration.seconds(30),
      vpc,
      vpcSubnets: { subnets },
      securityGroups: [lambdaSg],
      allowPublicSubnet: true,
      environment: dbEnv,
      logRetention: RetentionDays.ONE_WEEK,
      bundling: {
        minify: false,
        sourceMap: true,
        target: "es2020",
        tsconfig: tsconfigPath,
        preCompilation: true,
        esbuildArgs: {
          "--resolve-extensions": ".js,.jsx,.mjs,.cjs,.ts,.tsx",
        },
        externalModules: NEST_EXTERNALS,
        nodeModules: NEST_NODE_MODULES,
      },
    });

    const fnUrl = cartFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [HttpMethod.ALL],
        allowedHeaders: ["*"],
      },
    });

    const seederFn = new NodejsFunction(this, "DbSeeder", {
      functionName: "cart-db-seeder",
      runtime: Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "db-seeder-handler.ts"),
      memorySize: 256,
      timeout: Duration.minutes(2),
      vpc,
      vpcSubnets: { subnets },
      securityGroups: [lambdaSg],
      allowPublicSubnet: true,
      environment: dbEnv,
      logRetention: RetentionDays.ONE_WEEK,
      bundling: {
        minify: false,
        sourceMap: true,
        target: "es2022",
        externalModules: ["@aws-sdk/*"],
        nodeModules: ["pg"],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir: string, outputDir: string) => [
            `cp ${path.join(__dirname, "../sql/seed.sql")} ${outputDir}/seed.sql`,
          ],
        },
      },
    });

    const seederProvider = new Provider(this, "DbSeederProvider", {
      onEventHandler: seederFn,
      logRetention: RetentionDays.ONE_WEEK,
    });

    const seed = new CustomResource(this, "DbSeed", {
      serviceToken: seederProvider.serviceToken,
      properties: { version: "cart-seed-v2" },
    });

    // Make sure the SG ingress rule exists before the seeder fires; otherwise
    // the Lambda's first connection attempt can hit the un-opened firewall.
    seed.node.addDependency(ingressRule);

    new CfnOutput(this, "CartApiUrl", {
      value: fnUrl.url,
      description: "Cart Service Lambda Function URL",
    });
  }
}
