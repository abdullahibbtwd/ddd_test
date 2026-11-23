import {
  ClientKind,
  createId,
  ErrorCode,
  Role,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
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

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

describe("visits", () => {
  let ctx: AuthTestContext;
  let areaA: string;
  let areaB: string;
  let siteTypeId: string;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let officeId: string;
  let fieldId: string;
  let siteInA: string;
  let siteInB: string;
  let clientId: string;
  let subId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();

    areaA = createId();
    areaB = createId();
    await ctx.db.prisma.area.createMany({
      data: [
        { id: areaA, name: "Център", isActive: true },
        { id: areaB, name: "Изток", isActive: true },
      ],
    });

    const types = await ctx.db.prisma.siteType.findMany({ take: 1 });
    siteTypeId = types[0]?.id ?? createId();
    if (!types[0]) {
      await ctx.db.prisma.siteType.create({
        data: { id: siteTypeId, name: "Офис", isActive: true },
      });
    }

    clientId = createId();
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: ClientKind.INDIVIDUAL,
        name: "Посещения Клиент",
        nameNormalized: "poseshteniya klient",
        isActive: true,
      },
    });

    siteInA = createId();
    siteInB = createId();
    await ctx.db.prisma.site.createMany({
      data: [
        {
          id: siteInA,
          clientId,
          areaId: areaA,
          siteTypeId,
          name: "Обект А",
          address: "ул. А 1",
          status: SiteStatus.ACTIVE,
        },
        {
          id: siteInB,
          clientId,
          areaId: areaB,
          siteTypeId,
          name: "Обект Б",
          address: "ул. Б 1",
          status: SiteStatus.ACTIVE,
        },
      ],
    });

    officeId = createId();
    fieldId = createId();
    const field2Id = createId();
    const hash = await hashPassword(password);
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email: "office-v@test.local",
          name: "Office V",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-v@test.local",
          name: "Field V",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: field2Id,
          email: "field2-v@test.local",
          name: "Field2 V",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.createMany({
      data: [
        { id: createId(), userId: fieldId, areaId: areaA },
        { id: createId(), userId: field2Id, areaId: areaB },
      ],
    });

    subId = createId();
    await ctx.db.prisma.subscription.create({
      data: {
        id: subId,
        siteId: siteInA,
        services: [ServiceType.INSECT_CONTROL],
        frequency: SubscriptionFrequency.MONTHLY,
        rate: 80,
        rateIncludesVat: true,
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: null,
      },
    });

    officeCookies = await login(ctx, "office-v@test.local");
    fieldCookies = await login(ctx, "field-v@test.local");
  });

  it("creates subscription-backed visit and one-off amount", async () => {
    const today = todayInSofia(new Date());
    const subRes = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: siteInA,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    expect(subRes.statusCode).toBe(201);
    const subBody = subRes.json();
    expect(subBody.chargedAmount).toBe(80);
    expect(subBody.rateIncludesVat).toBe(true);
    expect(subBody.subscriptionId).toBe(subId);

    const oneOffSite = createId();
    await ctx.db.prisma.site.create({
      data: {
        id: oneOffSite,
        clientId,
        areaId: areaA,
        siteTypeId,
        name: "One-off",
        address: "x",
        status: SiteStatus.ACTIVE,
      },
    });
    const oneRes = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: oneOffSite,
        visitDate: today,
        treatmentType: ServiceType.OTHER,
        chargedAmount: 42.5,
        rateIncludesVat: false,
        clientMutationId: createId(),
      },
    });
    expect(oneRes.statusCode).toBe(201);
    expect(oneRes.json().chargedAmount).toBe(42.5);
    expect(oneRes.json().subscriptionId).toBeNull();
  });

  it("FIELD 7-day window rejects 8-days-ago and tomorrow", async () => {
    const today = todayInSofia(new Date());
    const eight = addDays(today, -8);
    const tomorrow = addDays(today, 1);
    const badPast = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        siteId: siteInA,
        visitDate: eight,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    expect(badPast.statusCode).toBe(422);
    expect(badPast.json().code).toBe(ErrorCode.VISIT_DATE_OUT_OF_WINDOW);

    const badFuture = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        siteId: siteInA,
        visitDate: tomorrow,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    expect([422, 400]).toContain(badFuture.statusCode);
  });

  it("FIELD 24-hour edit window at 23h59m and 24h01m", async () => {
    const today = todayInSofia(new Date());
    const createRes = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        siteId: siteInA,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    expect(createRes.statusCode).toBe(201);
    const visitId = createRes.json().id as string;

    // Backdate created_at AND visit_date together so the Sofia not-future CHECK holds.
    const createdOk = new Date(Date.now() - (23 * 60 + 59) * 60 * 1000);
    const dateOk = todayInSofia(createdOk);
    await ctx.db.prisma.visit.update({
      where: { id: visitId },
      data: { createdAt: createdOk, visitDate: new Date(`${dateOk}T00:00:00.000Z`) },
    });

    const ok = await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${visitId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { notes: "still ok" },
    });
    expect(ok.statusCode).toBe(200);

    const createdExpired = new Date(Date.now() - (24 * 60 + 1) * 60 * 1000);
    const dateExpired = todayInSofia(createdExpired);
    await ctx.db.prisma.visit.update({
      where: { id: visitId },
      data: {
        createdAt: createdExpired,
        visitDate: new Date(`${dateExpired}T00:00:00.000Z`),
      },
    });
    const expired = await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${visitId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { notes: "too late" },
    });
    expect(expired.statusCode).toBe(403);
    expect(expired.json().code).toBe(ErrorCode.VISIT_EDIT_WINDOW_EXPIRED);
  });

  it("FIELD cannot edit another user's visit", async () => {
    const today = todayInSofia(new Date());
    const createRes = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: siteInA,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    const visitId = createRes.json().id as string;
    const res = await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${visitId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { notes: "nope" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe(ErrorCode.VISIT_NOT_OWNER);
  });

  it("cancel requires reason and sets fields; cancelled cannot be edited; re-cancel 409", async () => {
    const today = todayInSofia(new Date());
    const createRes = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: siteInA,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    const visitId = createRes.json().id as string;

    const short = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/cancel`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { cancelReason: "ab" },
    });
    expect(short.statusCode).toBe(400);

    const cancel = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/cancel`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { cancelReason: "Клиентът отказа" },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe("CANCELLED");
    expect(cancel.json().cancelReason).toBe("Клиентът отказа");
    expect(cancel.json().cancelledAt).toBeTruthy();
    expect(cancel.json().cancelledBy).toBe(officeId);

    const edit = await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${visitId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { notes: "x" },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().code).toBe(ErrorCode.VISIT_ALREADY_CANCELLED);

    const again = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/cancel`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { cancelReason: "again again" },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe(ErrorCode.VISIT_ALREADY_CANCELLED);
  });

  it("idempotent retry returns 200 same id; different body returns 409", async () => {
    const today = todayInSofia(new Date());
    const mutationId = createId();
    const payload = {
      siteId: siteInA,
      visitDate: today,
      treatmentType: ServiceType.INSECT_CONTROL,
      clientMutationId: mutationId,
    };
    const first = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const id = first.json().id;

    const retry = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(id);

    const conflict = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { ...payload, notes: "different" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe(ErrorCode.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY);
  });

  it("20 concurrent creates with same clientMutationId produce exactly one row", async () => {
    const today = todayInSofia(new Date());
    const mutationId = createId();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ctx.inject({
          method: "POST",
          url: "/api/visits",
          headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
          payload: {
            siteId: siteInA,
            visitDate: today,
            treatmentType: ServiceType.INSECT_CONTROL,
            clientMutationId: mutationId,
          },
        }),
      ),
    );
    const ok = results.filter((r) => r.statusCode === 200 || r.statusCode === 201);
    expect(ok.length).toBe(20);
    const ids = new Set(ok.map((r) => r.json().id));
    expect(ids.size).toBe(1);
    const count = await ctx.db.prisma.visit.count({
      where: { createdById: officeId, clientMutationId: mutationId },
    });
    expect(count).toBe(1);
  });

  it("20 concurrent creates with different keys for same site all succeed", async () => {
    const today = todayInSofia(new Date());
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ctx.inject({
          method: "POST",
          url: "/api/visits",
          headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
          payload: {
            siteId: siteInA,
            visitDate: today,
            treatmentType: ServiceType.INSECT_CONTROL,
            clientMutationId: createId(),
          },
        }),
      ),
    );
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    const count = await ctx.db.prisma.visit.count({ where: { siteId: siteInA } });
    expect(count).toBe(20);
  });

  it("GET /sites/:id shows lastVisitAt; FIELD 404 out-of-scope; FIELD 403 POST out-of-scope", async () => {
    const today = todayInSofia(new Date());
    await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: siteInA,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    const siteRes = await ctx.inject({
      method: "GET",
      url: `/api/sites/${siteInA}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
    });
    expect(siteRes.statusCode).toBe(200);
    expect(siteRes.json().lastVisitAt).toBe(today);
    expect(siteRes.json().lastVisitSummary?.visitDate).toBe(today);

    const outGet = await ctx.inject({
      method: "GET",
      url: `/api/sites/${siteInB}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
    });
    expect(outGet.statusCode).toBe(404);

    const outPost = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        siteId: siteInB,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    expect(outPost.statusCode).toBe(403);
  });

  it("OFFICE backdates 90 days", async () => {
    const today = todayInSofia(new Date());
    const past = addDays(today, -90);
    const res = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: siteInA,
        visitDate: past,
        treatmentType: ServiceType.INSECT_CONTROL,
        clientMutationId: createId(),
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().visitDate).toBe(past);
  });

  it("visit_date after linked subscription end_date is rejected", async () => {
    const endedSub = createId();
    const site = createId();
    await ctx.db.prisma.site.create({
      data: {
        id: site,
        clientId,
        areaId: areaA,
        siteTypeId,
        name: "Ended sub site",
        address: "x",
        status: SiteStatus.ACTIVE,
      },
    });
    await ctx.db.prisma.subscription.create({
      data: {
        id: endedSub,
        siteId: site,
        services: [ServiceType.DISINFECTION],
        frequency: SubscriptionFrequency.MONTHLY,
        rate: 10,
        rateIncludesVat: false,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-01-31T00:00:00.000Z"),
      },
    });
    // No current subscription on visit date → one-off path; force link via raw then API update.
    // API create without current sub requires amount; then patch subscriptionId.
    const today = todayInSofia(new Date());
    const create = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: site,
        visitDate: today,
        treatmentType: ServiceType.DISINFECTION,
        chargedAmount: 10,
        clientMutationId: createId(),
      },
    });
    expect(create.statusCode).toBe(201);
    const patch = await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${create.json().id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { subscriptionId: endedSub },
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it("audit rows for create/edit/cancel share actor", async () => {
    const today = todayInSofia(new Date());
    const create = await ctx.inject({
      method: "POST",
      url: "/api/visits",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        siteId: siteInA,
        visitDate: today,
        treatmentType: ServiceType.INSECT_CONTROL,
        notes: "audit-create",
        clientMutationId: createId(),
      },
    });
    const visitId = create.json().id as string;
    await ctx.inject({
      method: "PATCH",
      url: `/api/visits/${visitId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { notes: "audit-edit" },
    });
    await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/cancel`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { cancelReason: "audit-cancel" },
    });

    const rows = await ctx.db.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "visits", entityId: visitId },
          { entityType: "visit_employees" },
        ],
        actorUserId: officeId,
      },
      orderBy: { occurredAt: "asc" },
    });
    expect(rows.some((r) => r.entityType === "visits" && r.action === "CREATE")).toBe(true);
    expect(rows.some((r) => r.entityType === "visits" && r.action === "UPDATE")).toBe(true);
    expect(rows.some((r) => r.entityType === "visit_employees" && r.action === "CREATE")).toBe(
      true,
    );
    expect(rows.every((r) => r.actorUserId === officeId)).toBe(true);
  });
});
