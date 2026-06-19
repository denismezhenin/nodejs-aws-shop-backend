import 'reflect-metadata';
import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { Handler } from 'aws-lambda';

import { AppModule } from './app.module';

let cached: Handler | undefined;

async function bootstrap(): Promise<Handler> {
  const expressApp = express();
  const nest = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { logger: ['error', 'warn', 'log'] },
  );
  // CORS is handled by the Lambda Function URL config (see CartServiceStack);
  // enabling it here too would emit a second Access-Control-Allow-Origin header
  // and break browser requests with a "multiple values" CORS error.
  await nest.init();

  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (event, context, callback) => {
  if (!cached) cached = await bootstrap();
  
  return cached(event, context, callback);
};
