import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { Logger } from "nestjs-pino";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { AppModule } from "./app.module";
import { enterActorContext } from "./audit/actor-context";
import { registerBullBoard } from "./bull-board/register-bull-board";
import { AppConfigService } from "./config/config.service";
import { loadEnvFiles } from "./config/load-env";
import { parseEnv } from "./config/env.schema";
import { buildTrustProxyOption } from "./config/trust-proxy";

export async function createApp(options?: {
  enableSwagger?: boolean;
  enableBullBoard?: boolean;
  /** Override TRUST_PROXY_HOPS for tests. */
  trustProxyHops?: number;
}): Promise<NestFastifyApplication> {
  loadEnvFiles();
  const env = parseEnv();
  const trustProxyHops = options?.trustProxyHops ?? env.TRUST_PROXY_HOPS;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Trust EXACTLY N hops — never `true`. Fastify 5 ignores numeric hop
      // counts (fail-closed); buildTrustProxyOption uses a hop-index function.
      trustProxy: buildTrustProxyOption(trustProxyHops),

      requestIdHeader: "x-request-id",
      genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
        const existing = req.headers["x-request-id"];
        return typeof existing === "string" && existing.length > 0 ? existing : randomUUID();
      },
    }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");

  const config = app.get(AppConfigService);

  // Same-origin via Vite proxy (dev) and Caddy (prod). Helmet default CORP
  // (same-origin) is fine; the previous cross-origin CORP exception is removed.
  await app.register(helmet);
  await app.register(cookie);

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", (request, _reply, done) => {
    enterActorContext({
      source: "api",
      actorUserId: null,
      actorLabel: null,
      requestId: String(request.id),
      ip: request.ip,
    });
    done();
  });
  fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", String(request.id));
    return payload;
  });

  // CORS kept for OriginGuard allowlist alignment and residual non-proxied clients
  // (e.g. hitting the API port directly). Browser SPA traffic is same-origin.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });

  const enableSwagger = options?.enableSwagger ?? !config.isProduction;
  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("DD CRM API")
      .setDescription("DD CRM backend API")
      .setVersion("0.0.0")
      .build();
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
    SwaggerModule.setup("api/docs", app, document);
  }

  const enableBullBoard = options?.enableBullBoard ?? true;
  if (enableBullBoard) {
    await registerBullBoard(app);
  }

  return app;
}
