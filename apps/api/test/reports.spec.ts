import {
  AuditSecurityAction,
  ClientKind,
  createId,
  DocumentType,
  ErrorCode,
  InvoiceStatus,
  Role,
  SiteStatus,
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

describe("reports (Task 21)", () => {
  let ctx: AuthTestContext;
  let areaId: string;
  let siteTypeId: string;
  let clientId: string;
  let siteId: string;
  let officeId: string;
  let fieldId: string;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;

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
    const hash = await hashPassword(password);

    await ctx.db.prisma.area.create({
      data: { id: areaId, name: "Район Р", isActive: true },
    });
    await ctx.db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Офис", isActive: true },
    });
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: ClientKind.COMPANY,
        name: "Справки Клиент",
        nameNormalized: "spravki klient",
        eik: "175074752",
        vatNumber: "BG175074752",
        registeredAddress: "София",
        legalRepresentative: "Иван",
        email: "reports@test.local",
        isActive: true,
      },
    });
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Обект Справки",
        address: "ул. С 1",
        status: SiteStatus.ACTIVE,
      },
    });
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email: "office-rep@test.local",
          name: "Office Rep",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-rep@test.local",
          name: "Field Rep",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.create({
      data: { id: createId(), userId: fieldId, areaId },
    });

    const invoiceId = createId();
    await ctx.db.prisma.invoice.create({
      data: {
        id: invoiceId,
        number: "0000000100",
        status: InvoiceStatus.ISSUED,
        documentType: DocumentType.INVOICE,
        clientId,
        siteId,
        issuedAt: new Date("2026-06-15T10:00:00.000Z"),
        issuedById: officeId,
        billingMonth: new Date("2026-06-01T00:00:00.000Z"),
        clientLegalName: "Справки Клиент",
        clientEik: "175074752",
        clientVatNumber: "BG175074752",
        clientRegisteredAddress: "София",
        clientLegalRepresentative: "Иван",
        netAmount: "100.00",
        vatAmount: "20.00",
        grossAmount: "120.00",
        dueDate: new Date("2026-07-15T00:00:00.000Z"),
        createdById: officeId,
      },
    });

    officeCookies = await login(ctx, "office-rep@test.local");
    fieldCookies = await login(ctx, "field-rep@test.local");
  });

  it("FIELD is 403 on JSON and export", async () => {
    const json = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(json.statusCode).toBe(403);

    const exp = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE/export?format=excel",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(exp.statusCode).toBe(403);
  });

  it("unknown kind is 404", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/NOT_A_REPORT",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe(ErrorCode.NOT_FOUND);
  });

  it("from > to is 422 REPORT_FILTER_INVALID", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE?from=2026-12-01&to=2026-01-01",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe(ErrorCode.REPORT_FILTER_INVALID);
  });

  it("invalid format is 400 INVALID_EXPORT_FORMAT", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE/export?format=csv",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ErrorCode.INVALID_EXPORT_FORMAT);
  });

  it("REVENUE JSON returns items and totals", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE?from=2026-06-01&to=2026-06-30",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.totals).toHaveProperty("grossAmount");
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("export excel has xlsx magic and pdf has %PDF", async () => {
    const xlsx = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE/export?format=excel&from=2026-06-01&to=2026-06-30",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(xlsx.statusCode).toBe(200);
    expect(String(xlsx.headers["content-type"])).toContain("spreadsheetml.sheet");
    const xbuf = Buffer.from(xlsx.rawPayload);
    expect(xbuf[0]).toBe(0x50);
    expect(xbuf[1]).toBe(0x4b);

    const pdf = await ctx.inject({
      method: "GET",
      url: "/api/reports/CASH/export?format=pdf&from=2026-01-01&to=2026-12-31",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(pdf.statusCode).toBe(200);
    expect(String(pdf.headers["content-type"])).toContain("application/pdf");
    expect(Buffer.from(pdf.rawPayload).subarray(0, 4).toString("utf8")).toBe("%PDF");
  }, 60_000);

  it("export too large returns 413 with override", async () => {
    const prev = process.env.REPORT_EXPORT_ROW_CAP_OVERRIDE;
    process.env.REPORT_EXPORT_ROW_CAP_OVERRIDE = "0";
    try {
      const res = await ctx.inject({
        method: "GET",
        url: "/api/reports/REVENUE/export?format=excel&from=2026-06-01&to=2026-06-30",
        headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      });
      expect(res.statusCode).toBe(413);
      expect(res.json().code).toBe(ErrorCode.REPORT_EXPORT_TOO_LARGE);
    } finally {
      if (prev === undefined) delete process.env.REPORT_EXPORT_ROW_CAP_OVERRIDE;
      else process.env.REPORT_EXPORT_ROW_CAP_OVERRIDE = prev;
    }
  });

  it("empty PRODUCTS returns empty shape", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/PRODUCTS?from=2020-01-01&to=2020-01-31",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toEqual([]);
    expect(body.totals.byUnit).toEqual({});
  });

  it("credit note reduces REVENUE totals; debit note increases", async () => {
    const invId = createId();
    const cnId = createId();
    const dnId = createId();
    await ctx.db.prisma.invoice.create({
      data: {
        id: invId,
        number: "0000000200",
        status: InvoiceStatus.ISSUED,
        documentType: DocumentType.INVOICE,
        clientId,
        siteId,
        issuedAt: new Date("2026-08-10T10:00:00.000Z"),
        issuedById: officeId,
        billingMonth: new Date("2026-08-01T00:00:00.000Z"),
        clientLegalName: "Справки Клиент",
        clientEik: "175074752",
        clientVatNumber: "BG175074752",
        clientRegisteredAddress: "София",
        clientLegalRepresentative: "Иван",
        netAmount: "200.00",
        vatAmount: "40.00",
        grossAmount: "240.00",
        dueDate: new Date("2026-09-10T00:00:00.000Z"),
        createdById: officeId,
      },
    });
    await ctx.db.prisma.invoice.create({
      data: {
        id: cnId,
        number: "0000000201",
        status: InvoiceStatus.ISSUED,
        documentType: DocumentType.CREDIT_NOTE,
        clientId,
        siteId,
        referencesInvoiceId: invId,
        creditNoteReason: "Корекция за справка",
        issuedAt: new Date("2026-08-11T10:00:00.000Z"),
        issuedById: officeId,
        // billing_month must be null for non-INVOICE documents
        clientLegalName: "Справки Клиент",
        clientEik: "175074752",
        clientVatNumber: "BG175074752",
        clientRegisteredAddress: "София",
        clientLegalRepresentative: "Иван",
        netAmount: "50.00",
        vatAmount: "10.00",
        grossAmount: "60.00",
        dueDate: new Date("2026-09-10T00:00:00.000Z"),
        createdById: officeId,
      },
    });
    await ctx.db.prisma.invoice.create({
      data: {
        id: dnId,
        number: "0000000202",
        status: InvoiceStatus.ISSUED,
        documentType: DocumentType.DEBIT_NOTE,
        clientId,
        siteId,
        referencesInvoiceId: invId,
        issuedAt: new Date("2026-08-12T10:00:00.000Z"),
        issuedById: officeId,
        clientLegalName: "Справки Клиент",
        clientEik: "175074752",
        clientVatNumber: "BG175074752",
        clientRegisteredAddress: "София",
        clientLegalRepresentative: "Иван",
        netAmount: "25.00",
        vatAmount: "5.00",
        grossAmount: "30.00",
        dueDate: new Date("2026-09-10T00:00:00.000Z"),
        createdById: officeId,
      },
    });

    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE?from=2026-08-01&to=2026-08-31&pageSize=50",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // 200 − 50 + 25 = 175 net
    expect(Number(body.totals.netAmount)).toBeCloseTo(175, 2);
    expect(Number(body.totals.grossAmount)).toBeCloseTo(210, 2);

    const byClient = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE?from=2026-08-01&to=2026-08-31&groupBy=CLIENT",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(byClient.statusCode).toBe(200);
    expect(Number(byClient.json().totals.netAmount)).toBeCloseTo(175, 2);
  });

  it("EXPIRATIONS JSON writes READ_PII; export writes READ_PII + EXPORT", async () => {
    const empId = createId();
    const certId = createId();
    await ctx.db.prisma.clientEmployee.create({
      data: {
        id: empId,
        clientId,
        siteId,
        fullName: "Справки Служител",
        jobTitle: "Техник",
        createdById: officeId,
      },
    });
    await ctx.db.prisma.healthCertificate.create({
      data: {
        id: certId,
        clientEmployeeId: empId,
        lastCertifiedAt: new Date("2025-01-01T00:00:00.000Z"),
        nextRenewalAt: new Date("2026-10-15T00:00:00.000Z"),
        createdById: officeId,
      },
    });

    const before = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    const json = await ctx.inject({
      method: "GET",
      url: "/api/reports/EXPIRATIONS?from=2026-01-01&to=2026-12-31",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(json.statusCode).toBe(200);
    const afterJson = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    expect(afterJson).toBe(before + 1);

    const beforeExport = await ctx.db.prisma.auditLog.count({
      where: {
        action: {
          in: [AuditSecurityAction.READ_PII, AuditSecurityAction.EXPORT],
        },
      },
    });
    const exp = await ctx.inject({
      method: "GET",
      url: "/api/reports/EXPIRATIONS/export?format=excel&from=2026-01-01&to=2026-12-31",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(exp.statusCode).toBe(200);
    const afterExport = await ctx.db.prisma.auditLog.count({
      where: {
        action: {
          in: [AuditSecurityAction.READ_PII, AuditSecurityAction.EXPORT],
        },
      },
    });
    // One READ_PII (page 1) + one EXPORT
    expect(afterExport).toBe(beforeExport + 2);
  });

  it("PRODUCTS excludes cancelled visit products", async () => {
    const productId = createId();
    const activeVisitId = createId();
    const cancelledVisitId = createId();
    await ctx.db.prisma.product.create({
      data: {
        id: productId,
        name: "E2E-REP Препарат",
        activeSubstances: ["x"],
        formulation: "LIQUID",
        archived: false,
        createdById: officeId,
      },
    });
    await ctx.db.prisma.visit.create({
      data: {
        id: activeVisitId,
        siteId,
        visitDate: new Date("2026-05-10T00:00:00.000Z"),
        status: "ACTIVE",
        treatmentType: "INSECT_CONTROL",
        chargedAmount: "10.00",
        rateIncludesVat: false,
        createdById: officeId,
        clientMutationId: createId(),
        employees: {
          create: {
            id: createId(),
            userId: officeId,
            roleOnVisit: "LEAD",
          },
        },
      },
    });
    await ctx.db.prisma.visit.create({
      data: {
        id: cancelledVisitId,
        siteId,
        visitDate: new Date("2026-05-11T00:00:00.000Z"),
        status: "CANCELLED",
        treatmentType: "INSECT_CONTROL",
        chargedAmount: "10.00",
        rateIncludesVat: false,
        createdById: officeId,
        clientMutationId: createId(),
        cancelledAt: new Date(),
        cancelledById: officeId,
        cancelReason: "test",
        employees: {
          create: {
            id: createId(),
            userId: officeId,
            roleOnVisit: "LEAD",
          },
        },
      },
    });
    await ctx.db.prisma.visitProduct.createMany({
      data: [
        {
          id: createId(),
          visitId: activeVisitId,
          productId,
          quantity: "10",
          unit: "ML",
          createdById: officeId,
        },
        {
          id: createId(),
          visitId: cancelledVisitId,
          productId,
          quantity: "99",
          unit: "ML",
          createdById: officeId,
        },
      ],
    });

    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/PRODUCTS?from=2026-05-01&to=2026-05-31",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(1);
    expect(Number(body.items[0].totalQuantity)).toBeCloseTo(10, 3);
    expect(body.totals.byUnit.ML).toBeDefined();
  });

  it("non-PII REVENUE export does not write READ_PII", async () => {
    const before = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    const res = await ctx.inject({
      method: "GET",
      url: "/api/reports/REVENUE/export?format=excel&from=2026-06-01&to=2026-06-30",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(res.statusCode).toBe(200);
    const after = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    expect(after).toBe(before);
  });
});
