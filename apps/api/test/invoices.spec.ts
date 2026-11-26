import {
  ClientKind,
  createId,
  ErrorCode,
  Role,
  SiteStatus,
  todayInSofia,
} from "@ddcrm/shared";
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

describe("invoices", () => {
  let ctx: AuthTestContext;
  let areaId: string;
  let siteTypeId: string;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let adminCookies: Record<string, string>;
  let officeId: string;
  let fieldId: string;
  let adminId: string;
  let siteId: string;
  let clientId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
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
        name: "Фактура Клиент",
        nameNormalized: "faktura klient",
        eik: "175074752",
        vatNumber: "BG175074752",
        registeredAddress: "София",
        legalRepresentative: "Иван",
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
    fieldId = createId();
    adminId = createId();
    const hash = await hashPassword(password);
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email: "office-inv@test.local",
          name: "Office Inv",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-inv@test.local",
          name: "Field Inv",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: adminId,
          email: "admin-inv@test.local",
          name: "Admin Inv",
          role: Role.ADMIN,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.create({
      data: { id: createId(), userId: fieldId, areaId },
    });

    officeCookies = await login(ctx, "office-inv@test.local");
    fieldCookies = await login(ctx, "field-inv@test.local");
    adminCookies = await login(ctx, "admin-inv@test.local");
  });

  async function createVisit(chargedAmount = 100): Promise<string> {
    const visitId = createId();
    const today = todayInSofia(new Date());
    // Deferred employee constraint requires visit+LEAD in the same transaction.
    // eslint-disable-next-line no-restricted-syntax -- test fixture
    await ctx.db.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax -- test fixture
      await tx.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${visitId}'::uuid, '${siteId}'::uuid, '${today}'::date, 'INSECT_CONTROL',
          ${chargedAmount.toFixed(2)}, false, 'ACTIVE',
          '${officeId}'::uuid, NOW(), NOW(), '${createId()}'::uuid
        )
      `);
      // eslint-disable-next-line no-restricted-syntax -- test fixture
      await tx.$executeRawUnsafe(`
        INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
        VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${officeId}'::uuid, 'LEAD')
      `);
    });
    return visitId;
  }

  async function createDraft(opts?: {
    visitIds?: string[];
    lines?: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      vatRate: string;
    }>;
  }) {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        visitIds: opts?.visitIds,
        lines: opts?.lines,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; lines: unknown[]; visits: unknown[]; number: string | null };
  }

  it("creates draft from visits with auto-lines (vat 20)", async () => {
    const visitId = await createVisit(80);
    const draft = await createDraft({ visitIds: [visitId] });
    expect(draft.number).toBeNull();
    expect(draft.visits).toHaveLength(1);
    expect(draft.lines).toHaveLength(1);
    const line = (draft.lines as Array<Record<string, string>>)[0]!;
    expect(line.description).toContain("Обект А");
    expect(line.description).toContain("Дезинсекция");
    expect(line.unitPrice).toBe("80.00");
    expect(line.vatRate).toBe("20.00");
    expect(line.lineTotal).toBe("80.00");
    expect(line.vatAmount).toBe("16.00");
  });

  it("issues draft: assigns 10-digit number, snapshot, and blocks second issue", async () => {
    const draft = await createDraft({
      lines: [
        {
          description: "Manual",
          quantity: "1",
          unitPrice: "10.00",
          vatRate: "20.00",
        },
      ],
    });

    const issued = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${draft.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(issued.statusCode).toBe(200);
    const body = issued.json();
    expect(body.number).toMatch(/^\d{10}$/);
    expect(body.status).toBe("ISSUED");
    expect(body.client).toBeNull();
    expect(body.snapshot.legalName).toBe("Фактура Клиент");
    expect(body.snapshot.eik).toBe("175074752");
    expect(body.issuedBy).toBe(officeId);

    const again = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${draft.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe(ErrorCode.INVOICE_ALREADY_ISSUED);
  });

  it("rejects issue of empty invoice with 422 EMPTY_INVOICE", async () => {
    const draft = await createDraft({});
    const res = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${draft.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe(ErrorCode.EMPTY_INVOICE);
  });

  it("FIELD cannot read or create invoices (403)", async () => {
    const list = await ctx.inject({
      method: "GET",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(list.statusCode).toBe(403);

    const create = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { clientId },
    });
    expect(create.statusCode).toBe(403);
  });

  it("rejects second invoice linking the same visit", async () => {
    const visitId = await createVisit();
    await createDraft({ visitIds: [visitId] });
    const conflict = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { clientId, visitIds: [visitId] },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe(ErrorCode.VISIT_ALREADY_INVOICED);
    expect(conflict.json().details.visitId).toBe(visitId);
    expect(conflict.json().details.conflictingInvoiceId).toBeTruthy();
  });

  it("rejects linking a cancelled visit with VISIT_NOT_INVOICEABLE", async () => {
    const visitId = await createVisit();
    const cancel = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/cancel`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { cancelReason: "Е2Е анулиране за фактура" },
    });
    expect(cancel.statusCode).toBe(200);

    const create = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { clientId, visitIds: [visitId] },
    });
    expect(create.statusCode).toBe(409);
    expect(create.json().code).toBe(ErrorCode.VISIT_NOT_INVOICEABLE);
  });

  it("ADMIN and OFFICE see all invoices (no per-user scoping)", async () => {
    const draft = await createDraft({
      lines: [
        { description: "X", quantity: "1", unitPrice: "10.00", vatRate: "20" },
      ],
    });
    const officeList = await ctx.inject({
      method: "GET",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(officeList.statusCode).toBe(200);
    expect(officeList.json().items.some((i: { id: string }) => i.id === draft.id)).toBe(true);

    const adminList = await ctx.inject({
      method: "GET",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminCookies) },
    });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json().items.some((i: { id: string }) => i.id === draft.id)).toBe(true);
  });

  it("creating and issuing a draft produces audit rows", async () => {
    const created = await createDraft({
      lines: [
        { description: "Одит ред", quantity: "1", unitPrice: "40.00", vatRate: "20" },
      ],
    });
    const issue = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${created.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(issue.statusCode).toBe(200);

    const createAudits = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "invoices", entityId: created.id, action: "CREATE" },
    });
    expect(createAudits.length).toBeGreaterThanOrEqual(1);
    expect(createAudits[0]?.actorUserId).toBeTruthy();

    const updateAudits = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "invoices", entityId: created.id, action: "UPDATE" },
    });
    expect(updateAudits.length).toBeGreaterThanOrEqual(1);
    const after = updateAudits[updateAudits.length - 1]?.after as Record<string, unknown> | null;
    expect(after?.number ?? after?.status).toBeTruthy();
  });

  it("blocks visit edit/cancel once linked to an invoice", async () => {
    const visitId = await createVisit();
    await createDraft({ visitIds: [visitId] });

    const edit = await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${visitId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { notes: "nope" },
    });
    expect(edit.statusCode).toBe(403);

    const cancel = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/cancel`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { cancelReason: "too late" },
    });
    expect(cancel.statusCode).toBe(403);
  });

  it("PATCH issued draft returns 409 INVOICE_ALREADY_ISSUED", async () => {
    const draft = await createDraft({
      lines: [
        { description: "X", quantity: "1", unitPrice: "1.00", vatRate: "0" },
      ],
    });
    const issued = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${draft.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });
    expect(issued.statusCode).toBe(200);

    const patch = await ctx.inject({
      method: "PATCH",
      url: `/api/invoices/${draft.id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { notes: "no" },
    });
    expect(patch.statusCode).toBe(409);
    expect(patch.json().code).toBe(ErrorCode.INVOICE_ALREADY_ISSUED);
  });

  it("50 parallel issues of different drafts yield unique gapless numbers", async () => {
    const drafts = [];
    for (let i = 0; i < 50; i++) {
      drafts.push(
        await createDraft({
          lines: [
            {
              description: `L${i}`,
              quantity: "1",
              unitPrice: "1.00",
              vatRate: "0",
            },
          ],
        }),
      );
    }

    const results = await Promise.all(
      drafts.map((d) =>
        ctx.inject({
          method: "POST",
          url: `/api/invoices/${d.id}/issue`,
          headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
          payload: {},
        }),
      ),
    );

    const nonOk = results.filter((r) => r.statusCode !== 200);
    expect(
      nonOk.map((r) => ({ status: r.statusCode, body: r.json() })),
      "all 50 distinct issues must succeed",
    ).toEqual([]);
    const numbers = results.map((r) => r.json().number as string).sort();
    expect(new Set(numbers).size).toBe(50);
    expect(numbers[0]).toBe("0000000001");
    expect(numbers[49]).toBe("0000000050");

    const counter = await ctx.db.prisma.invoiceCounter.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(counter.nextValue).toBe(51);
    // Evidence for the report: next_value == max_issued + 1
    // eslint-disable-next-line no-console -- concurrency evidence
    console.log(
      `[concurrency distinct] numbers ${numbers[0]}..${numbers[49]}; counter.next_value=${counter.nextValue}`,
    );
  }, 180_000);

  it("50 parallel issues of the same draft: one 200, rest 409", async () => {
    const draft = await createDraft({
      lines: [
        { description: "Race", quantity: "1", unitPrice: "5.00", vatRate: "20.00" },
      ],
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        ctx.inject({
          method: "POST",
          url: `/api/invoices/${draft.id}/issue`,
          headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
          payload: {},
        }),
      ),
    );

    const ok = results.filter((r) => r.statusCode === 200);
    const conflict = results.filter((r) => r.statusCode === 409);
    expect(ok).toHaveLength(1);
    expect(conflict).toHaveLength(49);
    expect(conflict.every((r) => r.json().code === ErrorCode.INVOICE_ALREADY_ISSUED)).toBe(
      true,
    );
    expect(ok[0]!.json().number).toBe("0000000001");

    const counter = await ctx.db.prisma.invoiceCounter.findUniqueOrThrow({
      where: { id: "default" },
    });
    // Counter advanced by exactly 1 despite 50 racing requests.
    expect(counter.nextValue).toBe(2);
    // eslint-disable-next-line no-console -- concurrency evidence
    console.log(
      `[concurrency same-draft] 1×200 + 49×409; counter.next_value=${counter.nextValue} (advanced by 1)`,
    );
  }, 180_000);

  it("lists drafts before issued", async () => {
    const draft = await createDraft({
      lines: [{ description: "D", quantity: "1", unitPrice: "1.00", vatRate: "0" }],
    });
    const toIssue = await createDraft({
      lines: [{ description: "I", quantity: "1", unitPrice: "1.00", vatRate: "0" }],
    });
    await ctx.inject({
      method: "POST",
      url: `/api/invoices/${toIssue.id}/issue`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {},
    });

    const list = await ctx.inject({
      method: "GET",
      url: "/api/invoices",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as Array<{ id: string; status: string }>;
    expect(items[0]!.id).toBe(draft.id);
    expect(items[0]!.status).toBe("DRAFT");
    expect(items.some((i) => i.status === "ISSUED")).toBe(true);
  });
});
