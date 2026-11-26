import {
  ClientKind,
  createId,
  ErrorCode,
  Role,
  SiteStatus,
  todayInSofia,
} from "@ddcrm/shared";
import { getQueueToken } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Queue } from "bullmq";
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

describe("payments (Task 17)", () => {
  let ctx: AuthTestContext;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let areaId: string;
  let siteTypeId: string;
  let siteId: string;
  let clientId: string;
  let officeId: string;
  let fieldId: string;
  let otherFieldId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
    areaId = createId();
    siteTypeId = createId();
    clientId = createId();
    siteId = createId();
    officeId = createId();
    fieldId = createId();
    otherFieldId = createId();
    const hash = await hashPassword(password);

    await ctx.db.prisma.area.create({
      data: { id: areaId, name: "Център", isActive: true },
    });
    await ctx.db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Офис", isActive: true },
    });
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: ClientKind.COMPANY,
        name: "Плащания Клиент",
        nameNormalized: "plashtaniya klient",
        eik: "175074752",
        vatNumber: "BG175074752",
        registeredAddress: "София",
        legalRepresentative: "Иван",
        email: "billing@pay.test",
        isActive: true,
      },
    });
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Обект П",
        address: "ул. П 1",
        status: SiteStatus.ACTIVE,
      },
    });
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email: "office-pay@test.local",
          name: "Office Pay",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-pay@test.local",
          name: "Field Pay",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: otherFieldId,
          email: "field-other@test.local",
          name: "Field Other",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.createMany({
      data: [
        { id: createId(), userId: fieldId, areaId },
        { id: createId(), userId: otherFieldId, areaId },
      ],
    });

    officeCookies = await login(ctx, "office-pay@test.local");
    fieldCookies = await login(ctx, "field-pay@test.local");
  });

  async function createFieldVisit(createdBy: string): Promise<string> {
    const visitId = createId();
    const today = todayInSofia(new Date());
    // eslint-disable-next-line no-restricted-syntax -- fixture
    await ctx.db.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax -- fixture
      await tx.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${visitId}'::uuid, '${siteId}'::uuid, '${today}'::date, 'INSECT_CONTROL',
          100.00, false, 'ACTIVE', '${createdBy}'::uuid, NOW(), NOW(), '${createId()}'::uuid
        )
      `);
      // eslint-disable-next-line no-restricted-syntax -- fixture
      await tx.$executeRawUnsafe(`
        INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
        VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${createdBy}'::uuid, 'LEAD')
      `);
    });
    return visitId;
  }

  async function issueInvoice(visitId?: string): Promise<{ id: string; grossAmount: string }> {
    const visit = visitId ?? (await createFieldVisit(fieldId));
    const create = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { clientId, visitIds: [visit] },
    });
    expect(create.statusCode).toBe(201);
    const draft = create.json() as { id: string };
    const issue = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${draft.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(issue.statusCode).toBe(200);
    const body = issue.json() as { id: string; grossAmount: string; dueDate: string };
    expect(body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    return body;
  }

  it("partial payments reduce outstanding; exact pay closes to 0; overpay 422", async () => {
    const inv = await issueInvoice();
    const today = todayInSofia(new Date());

    const p1 = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        amount: "40.00",
        method: "BANK_TRANSFER",
        paidAt: today,
      },
    });
    expect(p1.statusCode).toBe(201);

    const list1 = await ctx.inject({
      method: "GET",
      url: `/api/invoices/${inv.id}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(list1.statusCode).toBe(200);
    const body1 = list1.json() as { outstanding: string; paidSum: string };
    expect(body1.paidSum).toBe("40.00");
    expect(Number(body1.outstanding)).toBe(Number(inv.grossAmount) - 40);

    const remain = body1.outstanding;
    const p2 = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { amount: remain, method: "CARD", paidAt: today },
    });
    expect(p2.statusCode).toBe(201);

    const list2 = await ctx.inject({
      method: "GET",
      url: `/api/invoices/${inv.id}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect((list2.json() as { outstanding: string }).outstanding).toBe("0.00");

    const over = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { amount: "1.00", method: "CARD", paidAt: today },
    });
    expect(over.statusCode).toBe(422);
    expect((over.json() as { code: string }).code).toBe(
      ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
    );
  });

  it("pay draft / cancelled returns 409 INVOICE_NOT_ISSUED", async () => {
    const visit = await createFieldVisit(fieldId);
    const create = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { clientId, visitIds: [visit] },
    });
    const draftId = (create.json() as { id: string }).id;
    const today = todayInSofia(new Date());
    const draftPay = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${draftId}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { amount: "10.00", method: "CARD", paidAt: today },
    });
    expect(draftPay.statusCode).toBe(409);
    expect((draftPay.json() as { code: string }).code).toBe(ErrorCode.INVOICE_NOT_ISSUED);
  });

  it("FIELD can pay own invoiced visit; not others; not non-invoiced", async () => {
    const visit = await createFieldVisit(fieldId);
    const inv = await issueInvoice(visit);
    const today = todayInSofia(new Date());

    const ok = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visit}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { amount: "10.00", paidAt: today },
    });
    expect(ok.statusCode).toBe(201);
    expect((ok.json() as { method: string }).method).toBe("CASH");

    const otherVisit = await createFieldVisit(otherFieldId);
    await issueInvoice(otherVisit);
    const otherCookies = await login(ctx, "field-other@test.local");
    // fieldPay tries other field's visit
    const forbidden = await ctx.inject({
      method: "POST",
      url: `/api/visits/${otherVisit}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { amount: "10.00", paidAt: today },
    });
    expect(forbidden.statusCode).toBe(403);

    const bareVisit = await createFieldVisit(fieldId);
    const notInvoiced = await ctx.inject({
      method: "POST",
      url: `/api/visits/${bareVisit}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { amount: "10.00", paidAt: today },
    });
    expect(notInvoiced.statusCode).toBe(409);
    expect((notInvoiced.json() as { code: string }).code).toBe(ErrorCode.VISIT_NOT_INVOICED);

    void inv;
    void otherCookies;
  });

  it("cash handover allows over-handover (negative outstanding); FIELD ledger is self-only", async () => {
    const visit = await createFieldVisit(fieldId);
    await issueInvoice(visit);
    const today = todayInSofia(new Date());

    await ctx.inject({
      method: "POST",
      url: `/api/visits/${visit}/payments`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { amount: "50.00", paidAt: today },
    });

    const handover = await ctx.inject({
      method: "POST",
      url: "/api/cash-handovers",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        employeeId: fieldId,
        amount: "80.00",
        handedOverAt: today,
        receivedByUserId: officeId,
      },
    });
    expect(handover.statusCode).toBe(201);
    const hBody = handover.json() as { outstanding: string };
    expect(hBody.outstanding).toBe("-30.00");

    const ledger = await ctx.inject({
      method: "GET",
      url: "/api/reports/cash-ledger",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(ledger.statusCode).toBe(200);
    const employees = (ledger.json() as { employees: Array<{ employeeId: string }> })
      .employees;
    expect(employees).toHaveLength(1);
    expect(employees[0]!.employeeId).toBe(fieldId);

    const otherLedger = await ctx.inject({
      method: "GET",
      url: `/api/reports/cash-ledger?employeeId=${otherFieldId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(otherLedger.statusCode).toBe(403);

    const outstandingForbidden = await ctx.inject({
      method: "GET",
      url: "/api/invoices/outstanding",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(outstandingForbidden.statusCode).toBe(403);
  });

  it("reminder 202 enqueue; force bypass; no-email 409", async () => {
    const inv = await issueInvoice();
    // Make overdue by setting due_date in the past via raw (immutability blocks UPDATE).
    // Drop trigger briefly is too heavy; instead create with backdated due via disable.
    // eslint-disable-next-line no-restricted-syntax -- test overdue fixture
    await ctx.db.prisma.$executeRawUnsafe(`
      ALTER TABLE invoices DISABLE TRIGGER trg_invoices_reject_issued_mutation;
      UPDATE invoices SET due_date = DATE '2020-01-01' WHERE id = '${inv.id}'::uuid;
      ALTER TABLE invoices ENABLE TRIGGER trg_invoices_reject_issued_mutation;
    `);

    const send = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/reminder`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(send.statusCode).toBe(202);
    expect((send.json() as { jobId: string }).jobId).toMatch(/^invoice_reminder_/);

    const queue = ctx.app.get<Queue>(getQueueToken(QUEUE_NAMES.PAYMENT_REMINDER));
    const job = await queue.getJob((send.json() as { jobId: string }).jobId);
    expect(job).toBeTruthy();

    // unpaid-current without force
    const fresh = await issueInvoice(await createFieldVisit(fieldId));
    const notOverdue = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${fresh.id}/reminder`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(notOverdue.statusCode).toBe(409);
    expect((notOverdue.json() as { code: string }).code).toBe(
      ErrorCode.REMINDER_INVOICE_NOT_OVERDUE,
    );

    const forced = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${fresh.id}/reminder`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { force: true },
    });
    expect(forced.statusCode).toBe(202);

    // no email
    // eslint-disable-next-line no-restricted-syntax -- clear snapshot email
    await ctx.db.prisma.$executeRawUnsafe(`
      ALTER TABLE invoices DISABLE TRIGGER trg_invoices_reject_issued_mutation;
      UPDATE invoices SET client_email = NULL WHERE id = '${fresh.id}'::uuid;
      ALTER TABLE invoices ENABLE TRIGGER trg_invoices_reject_issued_mutation;
    `);
    const noEmail = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${fresh.id}/reminder`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { force: true },
    });
    expect(noEmail.statusCode).toBe(409);
    expect((noEmail.json() as { code: string }).code).toBe(ErrorCode.REMINDER_NO_EMAIL);
  });

  it("outstanding report returns classifications", async () => {
    await issueInvoice();
    const res = await ctx.inject({
      method: "GET",
      url: "/api/invoices/outstanding",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(200);
    const page = res.json() as { items: unknown[]; total: number };
    expect(page.total).toBeGreaterThanOrEqual(1);
  });
});
