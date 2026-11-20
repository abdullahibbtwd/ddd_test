import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.schema";

const validEnv = {
  NODE_ENV: "test",
  API_PORT: "3000",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://ddcrm:ddcrm@localhost:5432/ddcrm",
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGIN: "http://localhost:5173",
  JWT_ACCESS_SECRET: "test-jwt-access-secret-at-least-32-chars",
  S3_ENDPOINT: "http://localhost:3900",
  S3_REGION: "garage",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret",
  S3_BUCKET: "ddcrm",
  GOTENBERG_URL: "http://localhost:3001",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_FROM: "noreply@ddcrm.local",
} as const;

describe("parseEnv", () => {
  it("accepts a complete valid env", () => {
    const env = parseEnv({ ...validEnv });
    expect(env.API_PORT).toBe(3000);
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(env.BULLMQ_PREFIX).toBe("bull");
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it("refuses JWT_ACCESS_SECRET shorter than 32 characters", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: "too-short",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("defaults SMTP_SECURE to true for port 465", () => {
    const env = parseEnv({
      ...validEnv,
      SMTP_PORT: "465",
    });
    expect(env.SMTP_SECURE).toBe(true);
  });

  it("refuses to start when required vars are missing", () => {
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/Invalid environment configuration/);
  });

  it("refuses invalid API_PORT", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        API_PORT: "not-a-number",
      }),
    ).toThrow(/API_PORT/);
  });

  it("defaults TRUST_PROXY_HOPS to 0", () => {
    const env = parseEnv({ ...validEnv });
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it("accepts TRUST_PROXY_HOPS=1", () => {
    const env = parseEnv({ ...validEnv, TRUST_PROXY_HOPS: "1" });
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it("refuses E2E when NODE_ENV is production", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: "production",
        E2E: "1",
      }),
    ).toThrow(/E2E/);
  });

  it("allows E2E outside production", () => {
    const env = parseEnv({ ...validEnv, NODE_ENV: "test", E2E: "1" });
    expect(env.E2E).toBe("1");
  });
});
