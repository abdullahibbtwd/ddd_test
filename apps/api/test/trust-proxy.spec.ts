import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createId, ErrorCode, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { buildTrustProxyOption } from "../src/config/trust-proxy";
import { createApp } from "../src/create-app";
import { startTestDb, type TestDb } from "./helpers/db";

/** Simulated Caddy container address (immediate peer behind TRUST_PROXY_HOPS=1). */
const CADDY_IP = "10.0.0.2";
const CLIENT_IP = "203.0.113.50";

async function bootApp(
  db: TestDb,
  hops: number,
  nodeEnv: "test" | "development" = "test",
): Promise<NestFastifyApplication> {
  process.env.NODE_ENV = nodeEnv;
  process.env.API_PORT = "3000";
  process.env.APP_URL = "http://localhost:5173";
  process.env.DATABASE_URL = db.connectionString;
  process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? "test-jwt-access-secret-at-least-32-chars!!";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_DAYS = "30";
  process.env.TRUST_PROXY_HOPS = String(hops);
  process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:3900";
  process.env.S3_REGION = process.env.S3_REGION ?? "garage";
  process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? "key";
  process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? "secret";
  process.env.S3_BUCKET = process.env.S3_BUCKET ?? "ddcrm";
  process.env.GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3001";
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? "localhost";
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? "1025";
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? "noreply@ddcrm.local";
  delete process.env.E2E;

  const app = await createApp({
    enableSwagger: false,
    enableBullBoard: false,
    trustProxyHops: hops,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe("buildTrustProxyOption", () => {
  it("returns false for hops <= 0 and a hop-index function otherwise", () => {
    expect(buildTrustProxyOption(0)).toBe(false);
    expect(buildTrustProxyOption(-1)).toBe(false);
    const fn = buildTrustProxyOption(1);
    expect(typeof fn).toBe("function");
    if (typeof fn === "function") {
      expect(fn("10.0.0.2", 0)).toBe(true);
      expect(fn("10.0.0.2", 1)).toBe(false);
    }
  });
});

describe("TRUST_PROXY_HOPS client IP", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    process.env.NODE_ENV = "test";
    delete process.env.TRUST_PROXY_HOPS;
    await db?.stop();
  });

  it("with hops=1, X-Forwarded-For becomes auth_sessions.ip", async () => {
    await db.resetDb();
    const app = await bootApp(db, 1, "test");
    try {
      const password = "correct-horse-battery";
      await db.prisma.user.create({
        data: {
          id: createId(),
          email: "proxy@example.com",
          name: "Proxy",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: CADDY_IP,
        headers: {
          "x-forwarded-for": CLIENT_IP,
          origin: "http://localhost:5173",
        },
        payload: { email: "proxy@example.com", password },
      });
      expect(res.statusCode).toBe(200);

      const session = await db.prisma.authSession.findFirst({
        orderBy: { createdAt: "desc" },
      });
      expect(session?.ip).toBe(CLIENT_IP);
      expect(session?.ip).not.toBe(CADDY_IP);
    } finally {
      await app.close();
    }
  });

  it("with hops=0, X-Forwarded-For is ignored for auth_sessions.ip", async () => {
    await db.resetDb();
    const app = await bootApp(db, 0, "test");
    try {
      const password = "correct-horse-battery";
      await db.prisma.user.create({
        data: {
          id: createId(),
          email: "noproxy@example.com",
          name: "NoProxy",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: CADDY_IP,
        headers: {
          "x-forwarded-for": CLIENT_IP,
          origin: "http://localhost:5173",
        },
        payload: { email: "noproxy@example.com", password },
      });
      expect(res.statusCode).toBe(200);

      const session = await db.prisma.authSession.findFirst({
        orderBy: { createdAt: "desc" },
      });
      expect(session?.ip).toBe(CADDY_IP);
      expect(session?.ip).not.toBe(CLIENT_IP);
    } finally {
      await app.close();
    }
  });
});

describe("TRUST_PROXY_HOPS throttle bucket", () => {
  let db: TestDb;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    db = await startTestDb();
    app = await bootApp(db, 1, "development");
  }, 180_000);

  afterAll(async () => {
    process.env.NODE_ENV = "test";
    delete process.env.TRUST_PROXY_HOPS;
    await app?.close().catch(() => undefined);
    await db?.stop();
  });

  it("with hops=1, X-Forwarded-For changes the throttle bucket", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: CADDY_IP,
        headers: {
          "x-forwarded-for": "198.51.100.20",
          origin: "http://localhost:5173",
        },
        payload: { email: `nobody-${i}@example.com`, password: "wrong-password-xx" },
      });
      expect(res.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: CADDY_IP,
      headers: {
        "x-forwarded-for": "198.51.100.20",
        origin: "http://localhost:5173",
      },
      payload: { email: "nobody-11@example.com", password: "wrong-password-xx" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe(ErrorCode.TOO_MANY_REQUESTS);

    const other = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: CADDY_IP,
      headers: {
        "x-forwarded-for": "198.51.100.21",
        origin: "http://localhost:5173",
      },
      payload: { email: "other@example.com", password: "wrong-password-xx" },
    });
    expect(other.statusCode).toBe(401);
  });
});
