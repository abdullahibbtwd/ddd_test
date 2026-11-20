import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../../src/create-app";
import { startTestDb, type TestDb } from "./db";

export type AuthTestContext = {
  app: NestFastifyApplication;
  db: TestDb;
  inject: NestFastifyApplication["inject"];
};

/**
 * Boots a real Nest+Fastify app against an isolated Testcontainers Postgres.
 * Sets required env vars before createApp parses them.
 */
export type StartAuthTestAppOptions = {
  enableBullBoard?: boolean;
};

export async function startAuthTestApp(
  options?: StartAuthTestAppOptions,
): Promise<AuthTestContext> {
  const db = await startTestDb();

  process.env.NODE_ENV = "test";
  process.env.API_PORT = "3000";
  process.env.APP_URL = "http://localhost:5173";
  process.env.DATABASE_URL = db.connectionString;
  process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? "test-jwt-access-secret-at-least-32-chars!!";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_DAYS = "30";
  process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:3900";
  process.env.S3_REGION = process.env.S3_REGION ?? "garage";
  process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? "key";
  process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? "secret";
  process.env.S3_BUCKET = process.env.S3_BUCKET ?? "ddcrm";
  process.env.GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3001";
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? "localhost";
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? "1025";
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? "noreply@ddcrm.local";

  const app = await createApp({
    enableSwagger: false,
    enableBullBoard: options?.enableBullBoard ?? false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    db,
    inject: app.inject.bind(app),
  };
}

export async function stopAuthTestApp(ctx: AuthTestContext): Promise<void> {
  await ctx.app.close().catch(() => undefined);
  await ctx.db.stop();
}

export function parseCookies(setCookie: string | string[] | undefined): Record<string, string> {
  const headers = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  const out: Record<string, string> = {};
  for (const header of headers) {
    const [pair] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
