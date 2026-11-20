import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger as PinoLogger } from "nestjs-pino";
import { loadEnvFiles } from "./config/load-env";
import { parseEnv } from "./config/env.schema";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  loadEnvFiles();
  parseEnv();

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  const logger = new Logger("Worker");
  logger.log("Worker application context started (no HTTP server)");
}

void bootstrap();
