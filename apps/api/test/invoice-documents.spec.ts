import {
  ClientKind,
  createId,
  ErrorCode,
  Role,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
} from "@ddcrm/shared";
import { getQueueToken } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Queue } from "bullmq";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
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

async function login(
  ctx: AuthTestContext,
  email: string,
): Promise<Record<string, string>> {
  const res = await ctx.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return parseCookies(getSetCookie(res));
}

describe("invoice documents (Task 16)", () => {
  let ctx: AuthTestContext;
  let areaId: string;
  let siteTypeId: string;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let officeId: string;
  let siteId: string;
  let clientId: string;
  let invoiceEmailQueue: Queue;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
    invoiceEmailQueue = ctx.app.get<Queue>(getQueueToken(QUEUE_NAMES.INVOICE_EMAIL));
    await invoiceEmailQueue.pause();
  }, 180_000);

  afterAll(async () => {
    await invoiceEmailQueue?.resume().catch(() => undefined);
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();

    areaId = createId();
    await ctx.db.prisma.area.create({
      data: { id: areaId, name: "Център", isActive: true },
    });

    siteTypeId = createId();
    await ctx.db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Офис", isActive: true },
    });

    clientId = createId();
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: ClientKind.COMPANY,
        name: "Документ Клиент",
        nameNormalized: "dokument klient",
        eik: "175074752",
        vatNumber: "BG175074752",
        registeredAddress: "София",
        legalRepresentative: "Иван",
        email: "billing@test.local",
        isActive: true,
      },
    });

    siteId = createId();
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Обект А",
        address: "ул. А 1",
        status: SiteStatus.ACTIVE,
      },
    });

    officeId = createId();
    const fieldId = createId();
    const hash = await hashPassword(password);
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email: "office-docs@test.local",
          name: "Office Docs",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-docs@test.local",
          name: "Field Docs",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.create({
      data: { id: createId(), userId: fieldId, areaId },
    });

    officeCookies = await login(ctx, "office-docs@test.local");
    fieldCookies = await login(ctx, "field-docs@test.local");
  });

  async function createIssued(opts?: {
    lines?: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      vatRate: string;
    }>;
  }) {
    const lines = opts?.lines ?? [
      { description: "Услуга", quantity: "1.000", unitPrice: "100.00", vatRate: "20" },
    ];
    const created = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { clientId, lines },
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
    return issued.json() as {
      id: string;
      number: string;
      status: string;
      netAmount: string;
      lines: Array<{ description: string; quantity: string; unitPrice: string; vatRate: string }>;
    };
  }

  it("PDF original vs copy differ only by stamp; draft PDF is 404", async () => {
    const draft = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        lines: [{ description: "D", quantity: "1", unitPrice: "10.00", vatRate: "20" }],
      },
    });
    expect(draft.statusCode).toBe(201);
    const draftPdf = await ctx.inject({
      method: "GET",
      url: `/api/invoices/${draft.json().id}/pdf`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(draftPdf.statusCode).toBe(404);
    expect(draftPdf.json().code).toBe(ErrorCode.NOT_FOUND);

    const invoice = await createIssued();
    const originalRes = await ctx.inject({
      method: "GET",
      url: `/api/invoices/${invoice.id}/pdf`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    const copyRes = await ctx.inject({
      method: "GET",
      url: `/api/invoices/${invoice.id}/pdf?copy=1`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(originalRes.statusCode).toBe(200);
    expect(copyRes.statusCode).toBe(200);
    expect(originalRes.headers["content-type"]).toMatch(/application\/pdf/);
    expect(copyRes.headers["content-type"]).toMatch(/application\/pdf/);

    const original = Buffer.from(originalRes.rawPayload);
    const copy = Buffer.from(copyRes.rawPayload);
    expect(original.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(copy.subarray(0, 4).toString("utf8")).toBe("%PDF");
    // Gotenberg recompresses per render; stamp text length delta is small but
    // object streams can differ by ~1KB. Text extraction asserts the stamp.
    expect(Math.abs(original.length - copy.length)).toBeLessThan(2_000);

    const origDoc = await getDocumentProxy(new Uint8Array(original));
    const copyDoc = await getDocumentProxy(new Uint8Array(copy));
    const origText = await extractText(origDoc, { mergePages: true });
    const copyText = await extractText(copyDoc, { mergePages: true });
    const origJoined = Array.isArray(origText.text) ? origText.text.join(" ") : origText.text;
    const copyJoined = Array.isArray(copyText.text) ? copyText.text.join(" ") : copyText.text;
    expect(origJoined).toContain("ОРИГИНАЛ");
    expect(origJoined).not.toContain("КОПИЕ");
    expect(copyJoined).toContain("КОПИЕ");
    expect(copyJoined).not.toContain("ОРИГИНАЛ");
  }, 90_000);

  it("email enqueue returns 202, inserts pending email_events, idempotent job id", async () => {
    const invoice = await createIssued();
    const first = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/email`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { to: "recv@example.com" },
    });
    expect(first.statusCode).toBe(202);
    const jobId = first.json().jobId as string;
    expect(jobId).toMatch(/^invoice_email_/);

    const events = await ctx.db.prisma.emailEvent.findMany({
      where: { invoiceId: invoice.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.sentAt).toBeNull();
    expect(events[0]!.failedAt).toBeNull();
    expect(events[0]!.jobId).toBe(jobId);

    const job = await invoiceEmailQueue.getJob(jobId);
    expect(job).toBeTruthy();

    const second = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/email`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { to: "recv@example.com" },
    });
    expect(second.statusCode).toBe(202);
    expect(second.json().jobId).toBe(jobId);
    const eventsAfter = await ctx.db.prisma.emailEvent.findMany({
      where: { invoiceId: invoice.id },
    });
    expect(eventsAfter).toHaveLength(1);
  });

  it("credit note cancels original; second credit note 409; debit leaves ISSUED", async () => {
    const invoice = await createIssued();
    const line = {
      description: "Услуга",
      quantity: "1.000",
      unitPrice: "100.00",
      vatRate: "20",
    };

    const credit = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/credit-note`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        referencesInvoiceId: invoice.id,
        reason: "грешка при сумата",
        lines: [line],
      },
    });
    expect(credit.statusCode).toBe(201);
    expect(credit.json().documentType).toBe("CREDIT_NOTE");
    expect(credit.json().status).toBe("ISSUED");
    expect(credit.json().number).toMatch(/^\d{10}$/);

    const original = await ctx.db.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(original.status).toBe("CANCELLED_BY_CREDIT_NOTE");

    const audits = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "invoices", entityId: credit.json().id as string },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);

    const second = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/credit-note`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        referencesInvoiceId: invoice.id,
        reason: "още веднъж",
        lines: [line],
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe(ErrorCode.CREDIT_NOTE_ALREADY_EXISTS);

    const forDebit = await createIssued({
      lines: [{ description: "B", quantity: "1", unitPrice: "40.00", vatRate: "20" }],
    });
    const debit = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${forDebit.id}/debit-note`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        referencesInvoiceId: forDebit.id,
        reason: "допълнителна такса",
        lines: [{ description: "Доп.", quantity: "1", unitPrice: "10.00", vatRate: "20" }],
      },
    });
    expect(debit.statusCode).toBe(201);
    expect(debit.json().documentType).toBe("DEBIT_NOTE");
    const still = await ctx.db.prisma.invoice.findUniqueOrThrow({
      where: { id: forDebit.id },
    });
    expect(still.status).toBe("ISSUED");
  });

  it("batch dryRun/create/idempotent rerun and partial issue failure", async () => {
    const siteB = createId();
    await ctx.db.prisma.site.create({
      data: {
        id: siteB,
        clientId,
        areaId,
        siteTypeId,
        name: "Обект Б",
        address: "ул. Б 2",
        status: SiteStatus.ACTIVE,
      },
    });

    for (const sid of [siteId, siteB]) {
      await ctx.db.prisma.subscription.create({
        data: {
          id: createId(),
          siteId: sid,
          services: [ServiceType.INSECT_CONTROL],
          frequency: SubscriptionFrequency.MONTHLY,
          rate: "50.00",
          rateIncludesVat: false,
          startDate: new Date("2026-01-01"),
          endDate: null,
        },
      });
    }

    const dry = await ctx.inject({
      method: "POST",
      url: "/api/invoices/batch",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { month: "2026-09", dryRun: true },
    });
    expect(dry.statusCode).toBe(201);
    expect(dry.json().created).toBe(2);
    expect(dry.json().skipped).toBe(0);
    expect(await ctx.db.prisma.invoice.count()).toBe(0);

    const create = await ctx.inject({
      method: "POST",
      url: "/api/invoices/batch",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { month: "2026-09", dryRun: false },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().created).toBe(2);
    const createdIds = create.json().createdIds as string[];
    expect(createdIds).toHaveLength(2);

    const rerun = await ctx.inject({
      method: "POST",
      url: "/api/invoices/batch",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { month: "2026-09" },
    });
    expect(rerun.json().created).toBe(0);
    expect(rerun.json().skipped).toBe(2);

    const emptyDraft = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        lines: [{ description: "temp", quantity: "1", unitPrice: "1.00", vatRate: "0" }],
      },
    });
    const emptyId = emptyDraft.json().id as string;
    // Remove lines to make issue fail with EMPTY_INVOICE
    await ctx.db.prisma.invoiceLine.deleteMany({ where: { invoiceId: emptyId } });
    await ctx.db.prisma.invoice.update({
      where: { id: emptyId },
      data: { netAmount: "0", vatAmount: "0", grossAmount: "0" },
    });

    const issue = await ctx.inject({
      method: "POST",
      url: "/api/invoices/batch/issue",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { invoiceIds: [...createdIds, emptyId] },
    });
    expect(issue.statusCode).toBe(201);
    expect(issue.json().issued).toEqual(expect.arrayContaining(createdIds));
    expect(issue.json().issued).toHaveLength(2);
    expect(issue.json().failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: emptyId, reason: ErrorCode.EMPTY_INVOICE }),
      ]),
    );
  });

  it("FIELD is 403 on every invoice document route", async () => {
    const invoice = await createIssued();
    const hdr = {
      origin: "http://localhost:5173",
      cookie: cookieHeader(fieldCookies),
    };
    const cases = [
      await ctx.inject({ method: "GET", url: `/api/invoices/${invoice.id}/pdf`, headers: hdr }),
      await ctx.inject({
        method: "POST",
        url: `/api/invoices/${invoice.id}/email`,
        headers: hdr,
        payload: { to: "x@y.com" },
      }),
      await ctx.inject({
        method: "POST",
        url: `/api/invoices/${invoice.id}/credit-note`,
        headers: hdr,
        payload: {
          referencesInvoiceId: invoice.id,
          reason: "abc",
          lines: [{ description: "x", quantity: "1", unitPrice: "1.00", vatRate: "0" }],
        },
      }),
      await ctx.inject({
        method: "POST",
        url: `/api/invoices/${invoice.id}/debit-note`,
        headers: hdr,
        payload: {
          referencesInvoiceId: invoice.id,
          lines: [{ description: "x", quantity: "1", unitPrice: "1.00", vatRate: "0" }],
        },
      }),
      await ctx.inject({
        method: "POST",
        url: "/api/invoices/batch",
        headers: hdr,
        payload: { month: "2026-09", dryRun: true },
      }),
      await ctx.inject({
        method: "POST",
        url: "/api/invoices/batch/issue",
        headers: hdr,
        payload: { invoiceIds: [invoice.id] },
      }),
    ];
    for (const res of cases) {
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe(ErrorCode.FORBIDDEN);
    }
  });
});
