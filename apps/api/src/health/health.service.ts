import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { AppConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";

export type DependencyStatus = {
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
};

export type ReadinessResult = {
  status: "ok" | "degraded";
  checks: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    garage: DependencyStatus;
    gotenberg: DependencyStatus;
  };
};

@Injectable()
export class HealthService {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  async readiness(): Promise<ReadinessResult> {
    const [postgres, redis, garage, gotenberg] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkGarage(),
      this.checkGotenberg(),
    ]);

    const checks = { postgres, redis, garage, gotenberg };
    const status = Object.values(checks).every((check) => check.status === "up")
      ? "ok"
      : "degraded";

    return { status, checks };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "up", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const started = Date.now();
    const redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const pong = await redis.ping();
      if (pong !== "PONG") {
        throw new Error(`Unexpected ping response: ${pong}`);
      }
      return { status: "up", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      redis.disconnect();
    }
  }

  private async checkGarage(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      const response = await fetch(this.config.s3Endpoint, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      // Any HTTP response from the S3 API means Garage is reachable.
      if (response.status === 0) {
        throw new Error("No response from Garage");
      }
      return { status: "up", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkGotenberg(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      const response = await fetch(new URL("/health", this.config.gotenbergUrl), {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { status: "up", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
