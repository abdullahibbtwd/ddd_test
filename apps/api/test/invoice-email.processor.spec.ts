import {
  ClientKind,
  createId,
  Role,
  SiteStatus,
} from "@ddcrm/shared";
import { getQueueToken } from "@nestjs/bullmq";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Job, Queue, QueueEvents } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import {
  INVOICE_EMAIL_JOB,
  type InvoiceEmailJobData,
} from "../src/invoices/invoices-documents.service";
import { InvoiceEmailProcessor } from "../src/processors/invoice-email.processor";
import { redisConnectionFromUrl } from "../src/queue/redis-connection";
import { WorkerModule } from "../src/worker.module";
import {
  cookieHeader,
  parseCookies,
  startAuthTestApp,
  stopAuthTestApp,
  type AuthTestContext,
} from "./helpers/auth-app";

const password = "correct-horse-battery";

function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

describe("invoice-email processor", () => {
  const prefix = `test-inv-email-${createId()}`;
  let ctx: AuthTestContext;
  let workerContext: INestApplicationContext;
  let queueEvents: QueueEvents;
  let invoiceEmailQueue: Queue;
  let officeCookies: Record<string, string>;
  let clientId: string;
  let officeId: string;
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

    ctx = await startAuthTestApp();
    invoiceEmailQueue = ctx.app.get<Queue>(getQueueToken(QUEUE_NAMES.INVOICE_EMAIL));

    workerContext = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    workerContext.enableShutdownHooks();

    queueEvents = new QueueEvents(QUEUE_NAMES.INVOICE_EMAIL, {
      connection: redisConnectionFromUrl(redisUrl),
      prefix,
    });
    await queueEvents.waitUntilReady();
  }, 180_000);

  afterAll(async () => {
    await queueEvents?.close().catch(() => undefined);
    await workerContext?.close().catch(() => undefined);
    await invoiceEmailQueue?.obliterate({ force: true }).catch(() => undefined);
    await invoiceEmailQueue?.close().catch(() => undefined);
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
    await invoiceEmailQueue.obliterate({ force: true }).catch(() => undefined);

    const areaId = createId();
    const siteTypeId = createId();
    clientId = createId();
    const siteId = createId();
    officeId = createId();

    await ctx.db.prisma.area.create({
      data: { id: areaId, name: "A", isActive: true },
    });
    await ctx.db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Офис", isActive: true },
    });
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: ClientKind.COMPANY,
        name: "Email Client",
        nameNormalized: "email client",
        eik: "175074752",
        vatNumber: "BG175074752",
        registeredAddress: "София",
        legalRepresentative: "Иван",
        email: "client@test.local",
        isActive: true,
      },
    });
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Site",
        address: "Addr",
        status: SiteStatus.ACTIVE,
      },
    });
    const hash = await hashPassword(password);
    await ctx.db.prisma.user.create({
      data: {
        id: officeId,
        email: "office-email@test.local",
        name: "Office",
        role: Role.OFFICE,
        passwordHash: hash,
        passwordChangedAt: new Date(),
      },
    });

    const login = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "office-email@test.local", password },
    });
    officeCookies = parseCookies(getSetCookie(login));
  });

  async function createIssued(): Promise<{ id: string; number: string }> {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        lines: [{ description: "Услуга", quantity: "1", unitPrice: "100.00", vatRate: "20" }],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    const issued = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(issued.statusCode).toBe(200);
    return { id, number: issued.json().number as string };
  }

  it("sends via mailer and sets email_sent_at / email_events.sent_at", async () => {
    const invoice = await createIssued();
    const enqueued = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/email`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { to: "recv@example.com" },
    });
    expect(enqueued.statusCode).toBe(202);
    const jobId = enqueued.json().jobId as string;
    const job = await invoiceEmailQueue.getJob(jobId);
    expect(job).toBeTruthy();
    await job!.waitUntilFinished(queueEvents, 60_000);

    const event = await ctx.db.prisma.emailEvent.findUniqueOrThrow({
      where: { jobId },
    });
    expect(event.sentAt).not.toBeNull();
    expect(event.failedAt).toBeNull();

    const row = await ctx.db.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(row.emailSentAt).not.toBeNull();
    expect(row.emailLastError).toBeNull();
    expect(row.clientLegalName).toBe("Email Client");
  }, 90_000);

  it("on final SMTP failure sets failed_at and email_last_error; legal columns untouched", async () => {
    const invoice = await createIssued();
    const before = await ctx.db.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });

    const emailEventId = createId();
    await ctx.db.prisma.emailEvent.create({
      data: {
        id: emailEventId,
        invoiceId: invoice.id,
        toAddress: "fail@example.com",
        jobId: `invoice_email_fail_${invoice.id}`,
      },
    });

    // Force mail failure by pointing SMTP at a closed port for this process call path:
    // MailService is already constructed — instead throw by using unreachable host via
    // a synthetic job that the processor will run; swap mail by calling process and
    // stubbing via temporary env is unreliable. Call process with a Job that will hit
    // real SMTP failure after restarting worker with bad SMTP.
    await workerContext.close();
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1";
    process.env.SMTP_SECURE = "false";
    workerContext = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    workerContext.enableShutdownHooks();
    const failingProcessor = workerContext.get(InvoiceEmailProcessor);

    const fakeJob = {
      id: `fail-${invoice.id}`,
      name: INVOICE_EMAIL_JOB,
      data: {
        invoiceId: invoice.id,
        emailEventId,
        to: "fail@example.com",
        attempt: 1,
      } satisfies InvoiceEmailJobData,
      opts: { attempts: 1 },
      attemptsMade: 0,
    } as Job<InvoiceEmailJobData>;

    await expect(failingProcessor.process(fakeJob)).rejects.toThrow();

    const event = await ctx.db.prisma.emailEvent.findUniqueOrThrow({
      where: { id: emailEventId },
    });
    expect(event.failedAt).not.toBeNull();
    expect(event.error).toBeTruthy();

    const after = await ctx.db.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.emailLastError).toBeTruthy();
    expect(after.clientLegalName).toBe(before.clientLegalName);
    expect(Number(after.netAmount)).toBe(Number(before.netAmount));
    expect(after.clientEik).toBe(before.clientEik);

    // Restore Mailpit for other suites sharing the process.
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
