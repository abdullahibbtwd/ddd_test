import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getQueueToken } from "@nestjs/bullmq";
import { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Queue, QueueEvents } from "bullmq";
import { AppModule } from "../src/app.module";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { MailQueueService } from "../src/mail/mail-queue.service";
import {
  renderSmokeEmail,
  SMOKE_EMAIL_SUBJECT,
} from "../src/mail/templates/smoke";
import { PdfService } from "../src/pdf/pdf.service";
import { redisConnectionFromUrl } from "../src/queue/redis-connection";
import { buildKey } from "../src/storage/build-key";
import { StorageService } from "../src/storage/storage.service";
import { WorkerModule } from "../src/worker.module";

type MailpitMessageSummary = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

type MailpitMessage = {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
  Attachments: Array<{
    FileName: string;
    ContentType: string;
    PartID: string;
  }>;
};

const MAILPIT = "http://localhost:8025";

async function waitForMailpitMessage(
  predicate: (message: MailpitMessageSummary) => boolean,
  timeoutMs = 20_000,
): Promise<MailpitMessage> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const list = await fetch(`${MAILPIT}/api/v1/messages`);
    if (!list.ok) {
      throw new Error(`Mailpit list failed: ${list.status}`);
    }
    const body = (await list.json()) as { messages: MailpitMessageSummary[] };
    const match = body.messages.find(predicate);
    if (match) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
      if (!detail.ok) {
        throw new Error(`Mailpit message failed: ${detail.status}`);
      }
      return (await detail.json()) as MailpitMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Mailpit message");
}

describe("mail", () => {
  const prefix = `test-mail-${randomUUID()}`;
  let apiContext: INestApplicationContext;
  let workerContext: INestApplicationContext;
  let mailQueue: MailQueueService;
  let storage: StorageService;
  let pdf: PdfService;
  let emailQueue: Queue;
  let queueEvents: QueueEvents;
  let redisUrl: string;

  beforeAll(async () => {
    loadEnvFiles();
    process.env.NODE_ENV = "test";
    process.env.BULLMQ_PREFIX = prefix;
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_SECURE = "false";
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

    mailQueue = apiContext.get(MailQueueService);
    storage = apiContext.get(StorageService);
    pdf = apiContext.get(PdfService);
    emailQueue = apiContext.get(getQueueToken(QUEUE_NAMES.EMAIL));
    queueEvents = new QueueEvents(QUEUE_NAMES.EMAIL, {
      connection: redisConnectionFromUrl(redisUrl),
      prefix,
    });
    await queueEvents.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await queueEvents?.close();
    await workerContext?.close();
    await apiContext?.close();
    await emailQueue?.obliterate({ force: true }).catch(() => undefined);
    await emailQueue?.close().catch(() => undefined);
  });

  it("enqueues mail that the worker delivers to Mailpit with Cyrillic text", async () => {
    const token = randomUUID();
    const to = `smoke-${token}@example.com`;
    const { html, text } = await renderSmokeEmail();
    const subject = `${SMOKE_EMAIL_SUBJECT} ${token}`;

    const job = await mailQueue.enqueue({ to, subject, html, text });
    await job.waitUntilFinished(queueEvents, 20_000);

    const message = await waitForMailpitMessage((item) => item.Subject === subject);
    expect(message.Subject).toBe(subject);
    expect(message.Text).toContain("Ресторант");
    expect(message.HTML).toContain("Ресторант");
  }, 60_000);

  it("delivers a PDF attachment that starts with %PDF", async () => {
    const token = randomUUID();
    const to = `pdf-${token}@example.com`;
    const subject = `${SMOKE_EMAIL_SUBJECT} pdf ${token}`;
    const bytes = await pdf.smokePdf();
    const storageKey = buildKey("test-mail-pdf", "pdf");
    await storage.put(storageKey, bytes, "application/pdf");

    const { html, text } = await renderSmokeEmail();
    const job = await mailQueue.enqueue({
      to,
      subject,
      html,
      text,
      attachments: [{ filename: "pdf-smoke.pdf", storageKey }],
    });
    await job.waitUntilFinished(queueEvents, 30_000);

    const message = await waitForMailpitMessage((item) => item.Subject === subject);
    expect(message.Attachments.length).toBeGreaterThan(0);
    const attachment = message.Attachments[0]!;
    expect(attachment.FileName).toBe("pdf-smoke.pdf");

    const part = await fetch(
      `${MAILPIT}/api/v1/message/${message.ID}/part/${attachment.PartID}`,
    );
    expect(part.ok).toBe(true);
    const partBytes = Buffer.from(await part.arrayBuffer());
    expect(partBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  }, 90_000);

  it("retries and fails when SMTP is unreachable", async () => {
    await workerContext.close();

    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1";
    process.env.SMTP_SECURE = "false";

    workerContext = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    workerContext.enableShutdownHooks();

    const { html, text } = await renderSmokeEmail();
    const job = await mailQueue.enqueue(
      {
        to: "fail@example.com",
        subject: `fail-${randomUUID()}`,
        html,
        text,
      },
      {
        attempts: 3,
        backoff: { type: "fixed", delay: 50 },
      },
    );

    await expect(job.waitUntilFinished(queueEvents, 20_000)).rejects.toThrow();
    const failed = await emailQueue.getJob(job.id!);
    expect(await failed!.getState()).toBe("failed");
    expect(failed!.attemptsMade).toBe(3);

    // Restore Mailpit SMTP for any later hooks.
    await workerContext.close();
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_SECURE = "false";
    workerContext = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    workerContext.enableShutdownHooks();
  }, 90_000);
});
