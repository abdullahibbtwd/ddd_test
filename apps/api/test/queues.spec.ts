import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getQueueToken } from "@nestjs/bullmq";
import { NestFactory } from "@nestjs/core";
import { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { QUEUE_NAMES, jobId } from "@ddcrm/shared";
import { Queue, QueueEvents } from "bullmq";
import { AppModule } from "../src/app.module";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { DefaultProcessor } from "../src/processors/default.processor";
import { redisConnectionFromUrl } from "../src/queue/redis-connection";
import { WorkerModule } from "../src/worker.module";

describe("queues", () => {
  // BullMQ forbids ':' in the key prefix.
  const prefix = `test-${randomUUID()}`;
  let apiContext: INestApplicationContext;
  let workerContext: INestApplicationContext;
  let defaultQueue: Queue;
  let queueEvents: QueueEvents;
  let redisUrl: string;

  beforeAll(async () => {
    loadEnvFiles();
    process.env.NODE_ENV = "test";
    process.env.BULLMQ_PREFIX = prefix;
    const env = parseEnv({ ...process.env, NODE_ENV: "test", BULLMQ_PREFIX: prefix });
    redisUrl = env.REDIS_URL;

    apiContext = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await apiContext.init();

    workerContext = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    workerContext.enableShutdownHooks();

    defaultQueue = apiContext.get<Queue>(getQueueToken(QUEUE_NAMES.DEFAULT));
    queueEvents = new QueueEvents(QUEUE_NAMES.DEFAULT, {
      connection: redisConnectionFromUrl(redisUrl),
      prefix,
    });
    await queueEvents.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await queueEvents?.close();
    await workerContext?.close();
    await apiContext?.close();
    await defaultQueue?.obliterate({ force: true }).catch(() => undefined);
    await defaultQueue?.close().catch(() => undefined);
  });

  it("processes a job added by the API side on the worker side", async () => {
    const job = await defaultQueue.add("ping", { fail: false });
    const result = await job.waitUntilFinished(queueEvents, 15_000);
    expect(result).toMatchObject({ ok: true, jobId: job.id });

    const completed = await job.getState();
    expect(completed).toBe("completed");
  });

  it("retries a failing job and ends in failed after configured attempts", async () => {
    const job = await defaultQueue.add(
      "ping",
      { fail: true },
      {
        attempts: 3,
        backoff: { type: "fixed", delay: 50 },
        removeOnFail: false,
      },
    );

    await expect(job.waitUntilFinished(queueEvents, 15_000)).rejects.toThrow();

    // Refresh job from Redis after retries finish.
    const failed = await defaultQueue.getJob(job.id!);
    expect(failed).toBeTruthy();
    expect(await failed!.getState()).toBe("failed");
    expect(failed!.attemptsMade).toBe(3);
  });

  it("creates only one job when the same job id is enqueued twice", async () => {
    const id = jobId("dup-test", randomUUID(), 1);

    await defaultQueue.pause();
    try {
      const first = await defaultQueue.add("ping", { fail: false }, { jobId: id });
      const second = await defaultQueue.add("ping", { fail: false }, { jobId: id });
      expect(second.id).toBe(first.id);

      const matching = (
        await defaultQueue.getJobs(["waiting", "active", "delayed", "completed", "failed"])
      ).filter((job) => job.id === id);
      expect(matching).toHaveLength(1);
    } finally {
      await defaultQueue.resume();
    }
  });

  it("does not register processors on the API context", () => {
    expect(() => apiContext.get(DefaultProcessor)).toThrow();
    expect(workerContext.get(DefaultProcessor)).toBeInstanceOf(DefaultProcessor);
  });
});
