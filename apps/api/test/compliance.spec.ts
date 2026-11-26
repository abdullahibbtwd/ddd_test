import {
  AgreementStatus,
  AuditSecurityAction,
  CertificateStatus,
  createId,
  FoodResultStatus,
  Role,
  ServiceType,
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

describe("compliance / GDPR (Task 19)", () => {
  let ctx: AuthTestContext;
  let adminCookie: string;
  let officeCookie: string;
  let fieldCookie: string;
  let adminId: string;
  let officeId: string;
  let fieldId: string;
  let areaId: string;
  let siteId: string;
  let clientId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    await stopAuthTestApp(ctx);
  });

  async function login(email: string): Promise<string> {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "Password1!" },
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    return cookieHeader(parseCookies(res.headers["set-cookie"]));
  }

  beforeEach(async () => {
    await ctx.db.resetDb();
    adminId = createId();
    officeId = createId();
    fieldId = createId();
    areaId = createId();
    siteId = createId();
    clientId = createId();
    const siteTypeId = createId();
    const passwordHash = await hashPassword("Password1!");

    await ctx.db.prisma.area.create({
      data: { id: areaId, name: "Area P10", isActive: true },
    });
    await ctx.db.prisma.user.create({
      data: {
        id: adminId,
        email: "admin-p10@test.local",
        name: "Admin P10",
        role: Role.ADMIN,
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await ctx.db.prisma.user.create({
      data: {
        id: officeId,
        email: "office-p10@test.local",
        name: "Office P10",
        role: Role.OFFICE,
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await ctx.db.prisma.user.create({
      data: {
        id: fieldId,
        email: "field-p10@test.local",
        name: "Field P10",
        role: Role.FIELD,
        passwordHash,
        passwordChangedAt: new Date(),
        userAreas: { create: { id: createId(), areaId } },
      },
    });
    await ctx.db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Type P10", isActive: true },
    });
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: "COMPANY",
        name: "Client P10",
        nameNormalized: "client p10",
        eik: "175074752",
        isActive: true,
      },
    });
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Site P10",
        address: "ул. Тест 10",
        monitoringPointsCount: 0,
        status: "ACTIVE",
      },
    });

    adminCookie = await login("admin-p10@test.local");
    officeCookie = await login("office-p10@test.local");
    fieldCookie = await login("field-p10@test.local");
  });

  it("client employee CRUD + export + erasure", async () => {
    const create = await ctx.inject({
      method: "POST",
      url: "/api/client-employees",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        clientId,
        siteId,
        fullName: "Мария Георгиева",
        jobTitle: "Управител",
      },
    });
    expect(create.statusCode).toBe(201);
    const empId = create.json().id as string;

    const cert = await ctx.inject({
      method: "POST",
      url: "/api/health-certificates",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        clientEmployeeId: empId,
        lastCertifiedAt: "2026-01-01",
        nextRenewalAt: "2026-12-01",
      },
    });
    expect(cert.statusCode).toBe(201);

    const list = await ctx.inject({
      method: "GET",
      url: "/api/client-employees",
      headers: { cookie: officeCookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThanOrEqual(1);

    const readAudits = await ctx.db.prisma.auditLog.findMany({
      where: { action: AuditSecurityAction.READ_PII },
    });
    expect(readAudits.length).toBeGreaterThanOrEqual(1);

    const exportRes = await ctx.inject({
      method: "GET",
      url: `/api/client-employees/${empId}/export`,
      headers: { cookie: officeCookie },
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.json().employee.fullName).toBe("Мария Георгиева");
    expect(exportRes.json().certificates.length).toBe(1);

    const officeErase = await ctx.inject({
      method: "POST",
      url: `/api/client-employees/${empId}/erase`,
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: { reason: "тестова причина" },
    });
    expect(officeErase.statusCode).toBe(403);

    const erase = await ctx.inject({
      method: "POST",
      url: `/api/client-employees/${empId}/erase`,
      headers: { cookie: adminCookie, origin: "http://localhost:5173" },
      payload: { reason: "GDPR заявка от субекта" },
    });
    expect(erase.statusCode).toBe(201);
    expect(erase.json().fullName).toBe("[изтрито]");
    expect(erase.json().jobTitle).toBe("[изтрито]");

    const erasedAudit = await ctx.db.prisma.auditLog.findFirst({
      where: { action: AuditSecurityAction.ERASED, entityId: empId },
    });
    expect(erasedAudit).not.toBeNull();

    const after = await ctx.inject({
      method: "GET",
      url: `/api/client-employees/${empId}/export`,
      headers: { cookie: adminCookie },
    });
    expect(after.json().employee.fullName).toBe("[изтрито]");
    expect(after.json().certificates.length).toBe(1);
  });

  it("agreement renew chain + freeze + 409 second renew", async () => {
    const create = await ctx.inject({
      method: "POST",
      url: "/api/agreements",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        clientId,
        siteId,
        serviceType: ServiceType.INSECT_CONTROL,
        signedAt: "2025-01-01",
        expiresAt: "2026-01-01",
        contractValue: "1200.00",
      },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;

    const renew = await ctx.inject({
      method: "POST",
      url: `/api/agreements/${id}/renew`,
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: { newSignedAt: "2026-01-01" },
    });
    expect(renew.statusCode).toBe(201);
    expect(renew.json().previousAgreementId).toBe(id);
    expect(renew.json().storedStatus).toBe(AgreementStatus.ACTIVE);

    const prev = await ctx.db.prisma.agreement.findUniqueOrThrow({ where: { id } });
    expect(prev.status).toBe(AgreementStatus.RENEWED);

    const second = await ctx.inject({
      method: "POST",
      url: `/api/agreements/${id}/renew`,
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: { newSignedAt: "2026-02-01" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("AGREEMENT_ALREADY_RENEWED");

    const patchFrozen = await ctx.inject({
      method: "PATCH",
      url: `/api/agreements/${id}`,
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: { notes: "nope" },
    });
    expect(patchFrozen.statusCode).toBe(409);
    expect(patchFrozen.json().code).toBe("AGREEMENT_FROZEN");
  });

  it("food record advances schedule via trigger; frozen after result", async () => {
    const schedule = await ctx.inject({
      method: "POST",
      url: "/api/food-schedules",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        siteId,
        serviceType: ServiceType.DISINFECTION,
        cadenceMonths: 2,
        nextDueAt: "2026-11-01",
      },
    });
    expect(schedule.statusCode).toBe(201);
    const scheduleId = schedule.json().id as string;

    const record = await ctx.inject({
      method: "POST",
      url: "/api/food-records",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        scheduleId,
        siteId,
        collectedAt: "2026-11-01",
        sampleDescription: "Проба от кухня",
      },
    });
    expect(record.statusCode).toBe(201);
    const recordId = record.json().id as string;

    const updated = await ctx.db.prisma.foodSamplingSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    });
    expect(updated.nextDueAt.toISOString().slice(0, 10)).toBe("2027-01-01");

    const setResult = await ctx.inject({
      method: "PATCH",
      url: `/api/food-records/${recordId}`,
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        resultStatus: FoodResultStatus.CONFORMING,
        resultReceivedAt: "2026-11-10",
        resultSummary: "OK",
      },
    });
    expect(setResult.statusCode).toBe(200);

    const frozen = await ctx.inject({
      method: "PATCH",
      url: `/api/food-records/${recordId}`,
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: { notes: "cannot" },
    });
    expect(frozen.statusCode).toBe(409);
    expect(frozen.json().code).toBe("FOOD_RECORD_FROZEN");
  });

  it("READ_PII on employee/cert routes; not on agreements/food", async () => {
    const before = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    const emp = await ctx.inject({
      method: "POST",
      url: "/api/client-employees",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: { clientId, fullName: "Петър Иванов" },
    });
    const empId = emp.json().id as string;

    await ctx.inject({
      method: "GET",
      url: `/api/client-employees/${empId}`,
      headers: { cookie: officeCookie },
    });
    const afterRead = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    expect(afterRead).toBeGreaterThan(before);

    const beforeBiz = afterRead;
    await ctx.inject({
      method: "POST",
      url: "/api/agreements",
      headers: { cookie: officeCookie, origin: "http://localhost:5173" },
      payload: {
        clientId,
        siteId,
        serviceType: ServiceType.OTHER,
        signedAt: "2026-01-01",
        expiresAt: "2027-01-01",
        contractValue: "10.00",
      },
    });
    await ctx.inject({
      method: "GET",
      url: "/api/agreements",
      headers: { cookie: officeCookie },
    });
    await ctx.inject({
      method: "GET",
      url: "/api/food-records",
      headers: { cookie: officeCookie },
    });
    const afterBiz = await ctx.db.prisma.auditLog.count({
      where: { action: AuditSecurityAction.READ_PII },
    });
    expect(afterBiz).toBe(beforeBiz);
  });

  it("FIELD certified-employees is redacted (names + expiry, job title hidden)", async () => {
    const empId = createId();
    const asOf = todayInSofia(new Date());
    await ctx.db.prisma.clientEmployee.create({
      data: {
        id: empId,
        clientId,
        siteId,
        fullName: "Георги Димитров",
        jobTitle: "Готвач",
        notes: "secret notes",
        createdById: officeId,
      },
    });
    await ctx.db.prisma.healthCertificate.create({
      data: {
        id: createId(),
        clientEmployeeId: empId,
        lastCertifiedAt: new Date("2026-01-01"),
        nextRenewalAt: new Date(
          Date.UTC(
            Number(asOf.slice(0, 4)),
            Number(asOf.slice(5, 7)) - 1,
            Number(asOf.slice(8, 10)) + 10,
          ),
        ),
        createdById: officeId,
      },
    });

    const res = await ctx.inject({
      method: "GET",
      url: `/api/sites/${siteId}/certified-employees`,
      headers: { cookie: fieldCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items[0].fullName).toBe("Георги Димитров");
    expect(body.items[0].jobTitle).toBe("[скрито]");
    expect(body.items[0].nextRenewalAt).toBeTruthy();
    expect(body.items[0].notes).toBeUndefined();
    expect(body.items[0].status).toBe(CertificateStatus.EXPIRING);

    const officeRes = await ctx.inject({
      method: "GET",
      url: `/api/sites/${siteId}/certified-employees`,
      headers: { cookie: officeCookie },
    });
    expect(officeRes.json().items[0].jobTitle).toBe("Готвач");
  });

  it("certificate expiring endpoint returns matching rows", async () => {
    const empId = createId();
    const asOf = todayInSofia(new Date());
    await ctx.db.prisma.clientEmployee.create({
      data: {
        id: empId,
        clientId,
        fullName: "Експиращ",
        createdById: officeId,
      },
    });
    await ctx.db.prisma.healthCertificate.create({
      data: {
        id: createId(),
        clientEmployeeId: empId,
        lastCertifiedAt: new Date("2026-01-01"),
        nextRenewalAt: new Date(
          Date.UTC(
            Number(asOf.slice(0, 4)),
            Number(asOf.slice(5, 7)) - 1,
            Number(asOf.slice(8, 10)) + 5,
          ),
        ),
        createdById: officeId,
      },
    });
    const res = await ctx.inject({
      method: "GET",
      url: "/api/health-certificates/expiring?days=30",
      headers: { cookie: officeCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });
});
