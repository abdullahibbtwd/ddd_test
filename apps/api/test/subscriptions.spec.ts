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

describe("subscriptions", () => {
  let ctx: AuthTestContext;
  let areaA: string;
  let areaB: string;
  let siteTypeId: string;
  let adminCookies: Record<string, string>;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let field2Cookies: Record<string, string>;
  let siteInA: string;
  let siteInB: string;
  let clientId: string;

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
        name: "Абонамент Клиент",
        nameNormalized: "abonament klient",
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

    async function user(email: string, role: Role, areas: string[]) {
      const id = createId();
      await ctx.db.prisma.user.create({
        data: {
          id,
          email,
          name: email,
          role,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
          mustChangePassword: false,
        },
      });
      for (const areaId of areas) {
        await ctx.db.prisma.userArea.create({
          data: { id: createId(), userId: id, areaId },
        });
      }
    }

    await user("admin-sub@example.com", Role.ADMIN, []);
    await user("office-sub@example.com", Role.OFFICE, []);
    await user("field-sub@example.com", Role.FIELD, [areaA]);
    await user("field2-sub@example.com", Role.FIELD, [areaB]);

    adminCookies = await login(ctx, "admin-sub@example.com");
    officeCookies = await login(ctx, "office-sub@example.com");
    fieldCookies = await login(ctx, "field-sub@example.com");
    field2Cookies = await login(ctx, "field2-sub@example.com");
  }, 60_000);

  function createBody(overrides: Record<string, unknown> = {}) {
    return {
      siteId: siteInA,
      services: [ServiceType.INSECT_CONTROL],
      frequency: SubscriptionFrequency.MONTHLY,
      rate: 50,
      rateIncludesVat: false,
      startDate: "2026-01-01",
      ...overrides,
    };
  }

  it("OFFICE creates, patches and ends a subscription", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ notes: "първи" }),
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const patched = await ctx.inject({
      method: "PATCH",
      url: `/api/subscriptions/${id}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { rate: 75, rateIncludesVat: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().rate).toBe(75);

    const ended = await ctx.inject({
      method: "PATCH",
      url: `/api/subscriptions/${id}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { endDate: "2026-06-30" },
    });
    expect(ended.statusCode).toBe(200);
    expect(ended.json().endDate).toBe("2026-06-30");
  });

  it("overlap returns 409 SUBSCRIPTION_OVERLAP with conflicting id", async () => {
    const first = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody(),
    });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().id as string;

    const second = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ startDate: "2026-03-01", notes: "overlap" }),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe(ErrorCode.SUBSCRIPTION_OVERLAP);
    expect(second.json().details.conflictingSubscriptionId).toBe(firstId);
  });

  it("20 simultaneous overlapping creates: exactly one success", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        ctx.inject({
          method: "POST",
          url: "/api/subscriptions",
          headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
          payload: createBody({ notes: `race-${i}` }),
        }),
      ),
    );
    const successes = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    for (const c of conflicts) {
      expect(c.json().code).toBe(ErrorCode.SUBSCRIPTION_OVERLAP);
    }
  });

  it("creating for a TERMINATED site is 409 SITE_TERMINATED", async () => {
    await ctx.db.prisma.site.update({
      where: { id: siteInA },
      data: { status: SiteStatus.TERMINATED, terminatedAt: new Date() },
    });
    const res = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(ErrorCode.SITE_TERMINATED);
  });

  it("terminating a site ends its subscription in the same transaction", async () => {
    const today = todayInSofia(new Date());
    const created = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ startDate: "2020-01-01", endDate: null }),
    });
    expect(created.statusCode).toBe(201);
    const subId = created.json().id as string;

    const term = await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${siteInA}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { status: SiteStatus.TERMINATED },
    });
    expect(term.statusCode).toBe(200);
    expect(term.json().status).toBe(SiteStatus.TERMINATED);
    // Inclusive end: ending today is still current on today.
    expect(term.json().currentSubscription?.id).toBe(subId);
    expect(term.json().currentSubscription?.endDate).toBe(today);

    const sub = await ctx.db.prisma.subscription.findUnique({ where: { id: subId } });
    expect(sub?.endDate).toBeTruthy();
    const endIso = sub!.endDate!.toISOString().slice(0, 10);
    expect(endIso).toBe(today);
  });

  it("rollback: if subscription update fails, site stays ACTIVE", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ startDate: "2020-01-01" }),
    });
    expect(created.statusCode).toBe(201);

    // Force the in-transaction subscription UPDATE to fail so the site write rolls back.
    // eslint-disable-next-line no-restricted-syntax -- test-only failure trigger
    await ctx.db.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_reject_subscription_update() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced subscription update failure';
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS trg_test_reject_subscription_update ON subscriptions;
      CREATE TRIGGER trg_test_reject_subscription_update
        BEFORE UPDATE ON subscriptions
        FOR EACH ROW EXECUTE FUNCTION test_reject_subscription_update();
    `);

    try {
      const term = await ctx.inject({
        method: "PATCH",
        url: `/api/sites/${siteInA}`,
        headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
        payload: { status: SiteStatus.TERMINATED },
      });
      expect(term.statusCode).toBeGreaterThanOrEqual(500);

      const site = await ctx.db.prisma.site.findUnique({ where: { id: siteInA } });
      expect(site?.status).toBe(SiteStatus.ACTIVE);
    } finally {
      // eslint-disable-next-line no-restricted-syntax -- test cleanup
      await ctx.db.prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS trg_test_reject_subscription_update ON subscriptions;
        DROP FUNCTION IF EXISTS test_reject_subscription_update();
      `);
    }
  });

  it("future start date is accepted; reactivating does not revive subscription", async () => {
    const future = "2099-01-01";
    const created = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ startDate: future, endDate: null }),
    });
    expect(created.statusCode).toBe(201);
    const subId = created.json().id as string;

    // Terminate — no current-on-today subscription to end (start is future).
    const term = await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${siteInA}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { status: SiteStatus.TERMINATED },
    });
    expect(term.statusCode).toBe(200);

    // Manually end the future sub to mimic business closeout, then reactivate.
    await ctx.inject({
      method: "PATCH",
      url: `/api/subscriptions/${subId}`,
      headers: { cookie: cookieHeader(adminCookies), origin: "http://localhost:5173" },
      payload: { endDate: future },
    });

    const reactivate = await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${siteInA}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { status: SiteStatus.ACTIVE },
    });
    expect(reactivate.statusCode).toBe(200);
    expect(reactivate.json().currentSubscription).toBeNull();

    const sub = await ctx.db.prisma.subscription.findUnique({ where: { id: subId } });
    expect(sub?.endDate).toBeTruthy();
  });

  it("FIELD lists/reads only in-scope; 404 out-of-scope; 403 on write", async () => {
    const inScope = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ siteId: siteInA }),
    });
    const outScope = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ siteId: siteInB, startDate: "2026-01-01" }),
    });
    expect(inScope.statusCode).toBe(201);
    expect(outScope.statusCode).toBe(201);
    const inId = inScope.json().id as string;
    const outId = outScope.json().id as string;

    const list = await ctx.inject({
      method: "GET",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(fieldCookies) },
    });
    expect(list.statusCode).toBe(200);
    const ids = (list.json().items as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(inId);
    expect(ids).not.toContain(outId);

    const getIn = await ctx.inject({
      method: "GET",
      url: `/api/subscriptions/${inId}`,
      headers: { cookie: cookieHeader(fieldCookies) },
    });
    expect(getIn.statusCode).toBe(200);

    const getOut = await ctx.inject({
      method: "GET",
      url: `/api/subscriptions/${outId}`,
      headers: { cookie: cookieHeader(fieldCookies) },
    });
    expect(getOut.statusCode).toBe(404);

    const post = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(fieldCookies), origin: "http://localhost:5173" },
      payload: createBody({ siteId: siteInA, startDate: "2027-01-01" }),
    });
    expect(post.statusCode).toBe(403);

    const patch = await ctx.inject({
      method: "PATCH",
      url: `/api/subscriptions/${inId}`,
      headers: { cookie: cookieHeader(fieldCookies), origin: "http://localhost:5173" },
      payload: { rate: 1 },
    });
    expect(patch.statusCode).toBe(403);

    // field2 (area B) can see outScope
    const getOutField2 = await ctx.inject({
      method: "GET",
      url: `/api/subscriptions/${outId}`,
      headers: { cookie: cookieHeader(field2Cookies) },
    });
    expect(getOutField2.statusCode).toBe(200);

    const adminList = await ctx.inject({
      method: "GET",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(adminCookies) },
    });
    expect(adminList.json().total).toBeGreaterThanOrEqual(2);
  });

  it("audit: create, update, end, and auto-end on site termination", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ startDate: "2020-01-01" }),
    });
    const subId = created.json().id as string;

    await ctx.inject({
      method: "PATCH",
      url: `/api/subscriptions/${subId}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { rate: 99 },
    });

    await ctx.inject({
      method: "PATCH",
      url: `/api/subscriptions/${subId}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { endDate: "2025-12-31" },
    });

    // New open subscription then terminate site
    const second = await ctx.inject({
      method: "POST",
      url: "/api/subscriptions",
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: createBody({ startDate: "2026-01-01", endDate: null }),
    });
    const secondId = second.json().id as string;

    await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${siteInA}`,
      headers: { cookie: cookieHeader(officeCookies), origin: "http://localhost:5173" },
      payload: { status: SiteStatus.TERMINATED },
    });

    const officeUser = await ctx.db.prisma.user.findUnique({
      where: { email: "office-sub@example.com" },
    });

    const rows = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "subscriptions", actorUserId: officeUser!.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(rows.some((r) => r.action === "CREATE" && r.entityId === subId)).toBe(true);
    expect(rows.some((r) => r.action === "UPDATE" && r.entityId === subId)).toBe(true);
    expect(rows.some((r) => r.action === "UPDATE" && r.entityId === secondId)).toBe(true);

    const siteAudit = await ctx.db.prisma.auditLog.findFirst({
      where: {
        entityType: "sites",
        entityId: siteInA,
        action: "UPDATE",
        actorUserId: officeUser!.id,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(siteAudit).toBeTruthy();

    const autoEnd = rows.filter((r) => r.entityId === secondId && r.action === "UPDATE");
    expect(autoEnd.length).toBeGreaterThan(0);
    expect(autoEnd[autoEnd.length - 1]!.actorUserId).toBe(officeUser!.id);
  });
});
