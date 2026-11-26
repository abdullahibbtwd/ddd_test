import {
  ClientKind,
  createId,
  Role,
  SiteStatus,
  QUEUE_NAMES,
} from "@ddcrm/shared";
import { getQueueToken } from "@nestjs/bullmq";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { Job, Queue, QueueEvents } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import {
  PAYMENT_REMINDER_JOB,
  type PaymentReminderJobData,
} from "../src/payments/payments.service";
import { PaymentReminderProcessor } from "../src/processors/payment-reminder.processor";
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

describe("payment-reminder processor", () => {
  const prefix = `test-pay-rem-${createId()}`;
  let ctx: AuthTestContext;
  let workerContext: INestApplicationContext;
  let queueEvents: QueueEvents;
  let reminderQueue: Queue;
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
    reminderQueue = ctx.app.get<Queue>(getQueueToken(QUEUE_NAMES.PAYMENT_REMINDER));

    workerContext = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    workerContext.enableShutdownHooks();

    queueEvents = new QueueEvents(QUEUE_NAMES.PAYMENT_REMINDER, {
      connection: redisConnectionFromUrl(redisUrl),
      prefix,
    });
    await queueEvents.waitUntilReady();
  }, 180_000);

  afterAll(async () => {
    await queueEvents?.close().catch(() => undefined);
    await workerContext?.close().catch(() => undefined);
    await reminderQueue?.obliterate({ force: true }).catch(() => undefined);
    await reminderQueue?.close().catch(() => undefined);
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
    await reminderQueue.obliterate({ force: true }).catch(() => undefined);

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
        name: "Reminder Client",
        nameNormalized: "reminder client",
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
        email: "office-rem@test.local",
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
      payload: { email: "office-rem@test.local", password },
    });
    officeCookies = parseCookies(getSetCookie(login));
  });

  async function createIssuedOverdue(): Promise<{ id: string; number: string }> {
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
    // eslint-disable-next-line no-restricted-syntax -- overdue fixture
    await ctx.db.prisma.$executeRawUnsafe(`
      ALTER TABLE invoices DISABLE TRIGGER trg_invoices_reject_issued_mutation;
      UPDATE invoices SET due_date = DATE '2020-01-01' WHERE id = '${id}'::uuid;
      ALTER TABLE invoices ENABLE TRIGGER trg_invoices_reject_issued_mutation;
    `);
    return { id, number: issued.json().number as string };
  }

  it("sends reminder and sets email_events.sent_at (kind=REMINDER)", async () => {
    const invoice = await createIssuedOverdue();
    const enqueued = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/reminder`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(enqueued.statusCode).toBe(202);
    const jobId = enqueued.json().jobId as string;
    const job = await reminderQueue.getJob(jobId);
    expect(job).toBeTruthy();
    await job!.waitUntilFinished(queueEvents, 60_000);

    const event = await ctx.db.prisma.emailEvent.findUniqueOrThrow({
      where: { jobId },
    });
    expect(event.kind).toBe("REMINDER");
    expect(event.sentAt).not.toBeNull();
    expect(event.failedAt).toBeNull();
  }, 90_000);

  it("permanent fail when outstanding is already 0", async () => {
    const invoice = await createIssuedOverdue();
    const today = new Date().toISOString().slice(0, 10);
    const pay = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        amount: "120.00",
        method: "BANK_TRANSFER",
        paidAt: today,
      },
    });
    expect(pay.statusCode).toBe(201);

    const emailEventId = createId();
    const jobId = `invoice_reminder_${invoice.id}_paid`;
    await ctx.db.prisma.emailEvent.create({
      data: {
        id: emailEventId,
        invoiceId: invoice.id,
        kind: "REMINDER",
        toAddress: "recv@example.com",
        jobId,
      },
    });

    const processor = workerContext.get(PaymentReminderProcessor);
    const fakeJob = {
      id: jobId,
      name: PAYMENT_REMINDER_JOB,
      data: {
        invoiceId: invoice.id,
        emailEventId,
        to: "recv@example.com",
        attempt: 1,
      } satisfies PaymentReminderJobData,
    } as Job<PaymentReminderJobData>;

    await expect(processor.process(fakeJob)).rejects.toThrow(/paid|permanent/i);

    const event = await ctx.db.prisma.emailEvent.findUniqueOrThrow({
      where: { id: emailEventId },
    });
    expect(event.failedAt).not.toBeNull();
    expect(event.sentAt).toBeNull();
  }, 90_000);
});
