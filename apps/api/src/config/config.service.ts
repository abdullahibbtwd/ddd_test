import { Injectable } from "@nestjs/common";
import { Env } from "./env.schema";

@Injectable()
export class AppConfigService {
  constructor(private readonly env: Env) {}

  get nodeEnv(): Env["NODE_ENV"] {
    return this.env.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === "production";
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === "development";
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === "test";
  }

  get apiPort(): number {
    return this.env.API_PORT;
  }

  get appUrl(): string {
    return this.env.APP_URL.replace(/\/$/, "");
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  /** Origins allowed by OriginGuard (APP_URL + CORS_ORIGIN list). */
  get allowedOrigins(): string[] {
    return Array.from(new Set([this.appUrl, ...this.corsOrigins]));
  }

  get jwtAccessSecret(): string {
    return this.env.JWT_ACCESS_SECRET;
  }

  get accessTokenTtlSeconds(): number {
    return this.env.ACCESS_TOKEN_TTL_SECONDS;
  }

  get refreshTokenTtlDays(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS;
  }

  /** Exact reverse-proxy hop count for Fastify trustProxy (never `true`). */
  get trustProxyHops(): number {
    return this.env.TRUST_PROXY_HOPS;
  }

  get s3Endpoint(): string {
    return this.env.S3_ENDPOINT;
  }

  get s3Region(): string {
    return this.env.S3_REGION;
  }

  get s3AccessKey(): string {
    return this.env.S3_ACCESS_KEY;
  }

  get s3SecretKey(): string {
    return this.env.S3_SECRET_KEY;
  }

  get s3Bucket(): string {
    return this.env.S3_BUCKET;
  }

  get gotenbergUrl(): string {
    return this.env.GOTENBERG_URL;
  }

  get smtpHost(): string {
    return this.env.SMTP_HOST;
  }

  get smtpPort(): number {
    return this.env.SMTP_PORT;
  }

  get smtpFrom(): string {
    return this.env.SMTP_FROM;
  }

  get smtpSecure(): boolean {
    return this.env.SMTP_SECURE;
  }

  get smtpUser(): string | undefined {
    return this.env.SMTP_USER;
  }

  get smtpPassword(): string | undefined {
    return this.env.SMTP_PASSWORD;
  }

  get bullmqPrefix(): string {
    return this.env.BULLMQ_PREFIX;
  }
}
