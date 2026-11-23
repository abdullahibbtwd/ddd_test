import {
  ClientKind,
  createId,
  EmployeeRoleOnVisit,
  Role,
  ScheduleStatus,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
  VisitStatus,
  type MonthDaysResponse,
  type MonthResponse,
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
const MONTH = "2026-11";
const FIXED_NOW = "2026-11-15T10:00:00.000Z";

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

describe("scheduling /month", () => {
  let ctx: AuthTestContext;
  let areaA: string;
  let areaB: string;
  let siteTypeId: string;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let officeId: string;
  let fieldId: string;
  let assistId: string;
  let clientId: string;

  const siteIds: Record<string, string> = {};

  beforeAll(async () => {
    process.env.SCHEDULING_FIXED_NOW = FIXED_NOW;
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    delete process.env.SCHEDULING_FIXED_NOW;
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    process.env.SCHEDULING_FIXED_NOW = FIXED_NOW;
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
        name: "Месец Клиент",
        nameNormalized: "mesets klient",
        isActive: true,
      },
    });

    officeId = createId();
    fieldId = createId();
    assistId = createId();
    const hash = await hashPassword(password);
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email: "office-m@test.local",
          name: "Office M",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-m@test.local",
          name: "Field M",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: assistId,
          email: "assist-m@test.local",
          name: "Assist M",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.createMany({
      data: [
        { id: createId(), userId: fieldId, areaId: areaA },
        { id: createId(), userId: assistId, areaId: areaA },
      ],
    });

    async function makeSite(key: string, name: string, areaId: string) {
      const id = createId();
      siteIds[key] = id;
      await ctx.db.prisma.site.create({
        data: {
          id,
          clientId,
          areaId,
          siteTypeId,
          name,
          address: `ул. ${name}`,
          status: SiteStatus.ACTIVE,
        },
      });
      return id;
    }

    async function makeSub(
      siteId: string,
      opts: {
        frequency: (typeof SubscriptionFrequency)[keyof typeof SubscriptionFrequency];
        startDate: string;
        endDate?: string | null;
      },
    ) {
      await ctx.db.prisma.subscription.create({
        data: {
          id: createId(),
          siteId,
          services: [ServiceType.INSECT_CONTROL],
          frequency: opts.frequency,
          rate: 50,
          rateIncludesVat: true,
          startDate: new Date(`${opts.startDate}T00:00:00.000Z`),
          endDate: opts.endDate
            ? new Date(`${opts.endDate}T00:00:00.000Z`)
            : null,
        },
      });
    }

    async function makeVisit(
      siteId: string,
      visitDate: string,
      opts?: {
        status?: (typeof VisitStatus)[keyof typeof VisitStatus];
        leadId?: string;
        assistId?: string;
        createdById?: string;
      },
    ) {
      const visitId = createId();
      const lead = opts?.leadId ?? fieldId;
      const createdBy = opts?.createdById ?? lead;
      const status = opts?.status ?? VisitStatus.ACTIVE;
      const cancelled = status === VisitStatus.CANCELLED;
      await ctx.db.prisma.visit.create({
        data: {
          id: visitId,
          siteId,
          visitDate: new Date(`${visitDate}T00:00:00.000Z`),
          treatmentType: ServiceType.INSECT_CONTROL,
          chargedAmount: 50,
          rateIncludesVat: true,
          status,
          cancelledAt: cancelled ? new Date() : null,
          cancelledById: cancelled ? createdBy : null,
          cancelReason: cancelled ? "Тест анулиране" : null,
          createdById: createdBy,
          clientMutationId: createId(),
          employees: {
            create: [
              {
                id: createId(),
                userId: lead,
                roleOnVisit: EmployeeRoleOnVisit.LEAD,
              },
              ...(opts?.assistId
                ? [
                    {
                      id: createId(),
                      userId: opts.assistId,
                      roleOnVisit: EmployeeRoleOnVisit.ASSIST,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      return visitId;
    }

    // monthly, no visit this month → UPCOMING
    await makeSite("upcomingMonthly", "AAA Upcoming Monthly", areaA);
    await makeSub(siteIds.upcomingMonthly!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.upcomingMonthly!, "2026-10-10", {
      leadId: officeId,
      createdById: officeId,
    });

    // monthly, visit this month → SERVICED
    await makeSite("serviced", "BBB Serviced", areaA);
    await makeSub(siteIds.serviced!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.serviced!, "2026-11-05", {
      leadId: fieldId,
      assistId,
    });

    // quarterly due this month, no visit → UPCOMING
    await makeSite("upcomingQuarterly", "CCC Upcoming Quarterly", areaA);
    await makeSub(siteIds.upcomingQuarterly!, {
      frequency: SubscriptionFrequency.QUARTERLY,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.upcomingQuarterly!, "2026-08-10");

    // quarterly due 2 months ago → OVERDUE 2
    await makeSite("overdue", "DDD Overdue", areaA);
    await makeSub(siteIds.overdue!, {
      frequency: SubscriptionFrequency.QUARTERLY,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.overdue!, "2026-06-10");

    // ended last month → ENDED
    await makeSite("ended", "EEE Ended", areaA);
    await makeSub(siteIds.ended!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2025-01-01",
      endDate: "2026-10-31",
    });

    // starts next month → NOT_STARTED
    await makeSite("notStarted", "FFF Not Started", areaA);
    await makeSub(siteIds.notStarted!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-12-01",
    });

    // ON_DEMAND no visit → ON_DEMAND
    await makeSite("onDemand", "GGG On Demand", areaA);
    await makeSub(siteIds.onDemand!, {
      frequency: SubscriptionFrequency.ON_DEMAND,
      startDate: "2026-01-01",
    });

    // ON_DEMAND with visit this month → engine returns ON_DEMAND (not SERVICED)
    await makeSite("onDemandServiced", "HHH On Demand Visit", areaA);
    await makeSub(siteIds.onDemandServiced!, {
      frequency: SubscriptionFrequency.ON_DEMAND,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.onDemandServiced!, "2026-11-08");

    // no subscription
    await makeSite("noSub", "III No Sub", areaA);

    // cancelled visit this month ignored → UPCOMING
    await makeSite("cancelled", "JJJ Cancelled Visit", areaA);
    await makeSub(siteIds.cancelled!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.cancelled!, "2026-10-01", { leadId: fieldId });
    await makeVisit(siteIds.cancelled!, "2026-11-03", {
      status: VisitStatus.CANCELLED,
      leadId: fieldId,
    });

    // area B only (for area filter / FIELD scope)
    await makeSite("areaB", "KKK Area B", areaB);
    await makeSub(siteIds.areaB!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
    });

    // ASSIST-only this month (employee filter must not match assist)
    await makeSite("assistOnly", "LLL Assist Only", areaA);
    await makeSub(siteIds.assistOnly!, {
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
    });
    await makeVisit(siteIds.assistOnly!, "2026-11-04", {
      leadId: officeId,
      assistId,
      createdById: officeId,
    });

    // Extra sites for pagination (names sort after LLL)
    for (let i = 0; i < 15; i++) {
      const id = await makeSite(`page${i}`, `MMM Page ${String(i).padStart(2, "0")}`, areaA);
      await makeSub(id, {
        frequency: SubscriptionFrequency.MONTHLY,
        startDate: "2026-01-01",
      });
      await makeVisit(id, "2026-11-02", { leadId: fieldId });
    }

    officeCookies = await login(ctx, "office-m@test.local");
    fieldCookies = await login(ctx, "field-m@test.local");
  }, 120_000);

  async function getMonth(
    cookies: Record<string, string>,
    qs: string,
  ): Promise<{ status: number; body: MonthResponse }> {
    const res = await ctx.inject({
      method: "GET",
      url: `/api/scheduling/month?${qs}`,
      headers: {
        origin: "http://localhost:5173",
        cookie: cookieHeader(cookies),
      },
    });
    return { status: res.statusCode, body: JSON.parse(res.body) as MonthResponse };
  }

  async function getDays(
    cookies: Record<string, string>,
    qs: string,
  ): Promise<{ status: number; body: MonthDaysResponse }> {
    const res = await ctx.inject({
      method: "GET",
      url: `/api/scheduling/month/days?${qs}`,
      headers: {
        origin: "http://localhost:5173",
        cookie: cookieHeader(cookies),
      },
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as MonthDaysResponse,
    };
  }

  it("monthly no visit this month → UPCOMING; employeeId filter empty for stranger", async () => {
    const { status, body } = await getMonth(
      officeCookies,
      `month=${MONTH}&pageSize=100`,
    );
    expect(status).toBe(200);
    const row = body.rows.find((r) => r.siteId === siteIds.upcomingMonthly);
    expect(row?.status).toBe(ScheduleStatus.UPCOMING);

    const filtered = await getMonth(
      officeCookies,
      `month=${MONTH}&employeeId=${assistId}&pageSize=100`,
    );
    expect(
      filtered.body.rows.find((r) => r.siteId === siteIds.upcomingMonthly),
    ).toBeUndefined();
  });

  it("monthly visit this month → SERVICED with LEAD first", async () => {
    const { body } = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    const row = body.rows.find((r) => r.siteId === siteIds.serviced);
    expect(row?.status).toBe(ScheduleStatus.SERVICED);
    expect(row?.employees[0]?.role).toBe(EmployeeRoleOnVisit.LEAD);
    expect(row?.employees[0]?.userId).toBe(fieldId);
  });

  it("quarterly due this month → UPCOMING; overdue by 2 months", async () => {
    const { body } = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    expect(body.rows.find((r) => r.siteId === siteIds.upcomingQuarterly)?.status).toBe(
      ScheduleStatus.UPCOMING,
    );
    const overdue = body.rows.find((r) => r.siteId === siteIds.overdue);
    expect(overdue?.status).toBe(ScheduleStatus.OVERDUE);
    expect(overdue?.monthsOverdue).toBe(2);
  });

  it("ENDED / NOT_STARTED / ON_DEMAND statuses", async () => {
    const { body } = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    expect(body.rows.find((r) => r.siteId === siteIds.ended)?.status).toBe(
      ScheduleStatus.ENDED,
    );
    expect(body.rows.find((r) => r.siteId === siteIds.notStarted)?.status).toBe(
      ScheduleStatus.NOT_STARTED,
    );
    expect(body.rows.find((r) => r.siteId === siteIds.onDemand)?.status).toBe(
      ScheduleStatus.ON_DEMAND,
    );
    // Engine priority: ON_DEMAND before SERVICED — leave computeScheduleStatus alone.
    expect(body.rows.find((r) => r.siteId === siteIds.onDemandServiced)?.status).toBe(
      ScheduleStatus.ON_DEMAND,
    );
  });

  it("site with no subscription excluded; counted in withoutSubscription", async () => {
    const { body } = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    expect(body.rows.find((r) => r.siteId === siteIds.noSub)).toBeUndefined();
    expect(body.summary.withoutSubscription).toBeGreaterThanOrEqual(1);
  });

  it("cancelled visit this month is ignored (stays UPCOMING)", async () => {
    const { body } = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    expect(body.rows.find((r) => r.siteId === siteIds.cancelled)?.status).toBe(
      ScheduleStatus.UPCOMING,
    );
  });

  it("employeeId filter: LEAD this month; created_by when no visit this month; not ASSIST", async () => {
    const leadMatch = await getMonth(
      officeCookies,
      `month=${MONTH}&employeeId=${fieldId}&pageSize=100`,
    );
    expect(leadMatch.body.rows.some((r) => r.siteId === siteIds.serviced)).toBe(true);

    const creatorMatch = await getMonth(
      officeCookies,
      `month=${MONTH}&employeeId=${officeId}&pageSize=100`,
    );
    expect(
      creatorMatch.body.rows.some((r) => r.siteId === siteIds.upcomingMonthly),
    ).toBe(true);

    const assistMatch = await getMonth(
      officeCookies,
      `month=${MONTH}&employeeId=${assistId}&pageSize=100`,
    );
    expect(
      assistMatch.body.rows.some((r) => r.siteId === siteIds.assistOnly),
    ).toBe(false);
    expect(
      assistMatch.body.rows.some((r) => r.siteId === siteIds.serviced),
    ).toBe(false);
  });

  it("areaId filter only that area", async () => {
    const { body } = await getMonth(
      officeCookies,
      `month=${MONTH}&areaId=${areaB}&pageSize=100`,
    );
    expect(body.rows.every((r) => r.areaId === areaB)).toBe(true);
    expect(body.rows.some((r) => r.siteId === siteIds.areaB)).toBe(true);
    expect(body.rows.some((r) => r.siteId === siteIds.serviced)).toBe(false);
  });

  it("FIELD scope: only in-scope; out-of-scope filter returns empty not 404", async () => {
    const inScope = await getMonth(fieldCookies, `month=${MONTH}&pageSize=100`);
    expect(inScope.status).toBe(200);
    expect(inScope.body.rows.every((r) => r.areaId === areaA)).toBe(true);
    expect(inScope.body.rows.some((r) => r.siteId === siteIds.areaB)).toBe(false);

    const out = await getMonth(
      fieldCookies,
      `month=${MONTH}&areaId=${areaB}&pageSize=100`,
    );
    expect(out.status).toBe(200);
    expect(out.body.rows).toEqual([]);
    expect(out.body.summary.totalSites).toBe(0);
  });

  it("pagination 20/page stable order (status, overdue desc, name)", async () => {
    const page1 = await getMonth(officeCookies, `month=${MONTH}&page=1&pageSize=20`);
    const page2 = await getMonth(officeCookies, `month=${MONTH}&page=2&pageSize=20`);
    expect(page1.body.rows).toHaveLength(20);
    expect(page1.body.pageSize).toBe(20);
    expect(page1.body.total).toBeGreaterThan(20);
    expect(page2.body.rows.length).toBeGreaterThan(0);

    const all = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    const statuses = all.body.rows.map((r) => r.status);
    const firstOverdue = statuses.indexOf(ScheduleStatus.OVERDUE);
    const firstUpcoming = statuses.indexOf(ScheduleStatus.UPCOMING);
    if (firstOverdue !== -1 && firstUpcoming !== -1) {
      expect(firstOverdue).toBeLessThan(firstUpcoming);
    }
  });

  it("calendar days cover the month; buckets match list invariant", async () => {
    const list = await getMonth(officeCookies, `month=${MONTH}&pageSize=100`);
    const days = await getDays(officeCookies, `month=${MONTH}`);
    expect(days.status).toBe(200);
    expect(days.body.days).toHaveLength(30);

    const serviced = new Set(
      list.body.rows
        .filter((r) => r.status === ScheduleStatus.SERVICED)
        .map((r) => r.siteId),
    );
    const due = new Set(
      list.body.rows
        .filter((r) => r.status === ScheduleStatus.UPCOMING)
        .map((r) => r.siteId),
    );
    const overdue = new Set(
      list.body.rows
        .filter((r) => r.status === ScheduleStatus.OVERDUE)
        .map((r) => r.siteId),
    );

    const dayServiced = new Set(days.body.days.flatMap((d) => d.servicedSiteIds));
    const dayDue = new Set(days.body.days.flatMap((d) => d.dueSiteIds));
    const dayOverdue = new Set(days.body.days.flatMap((d) => d.overdueSiteIds));

    expect([...dayServiced].sort()).toEqual([...serviced].sort());
    expect([...dayDue].sort()).toEqual([...due].sort());
    expect([...dayOverdue].sort()).toEqual([...overdue].sort());

    // due/overdue appear on every day
    for (const d of days.body.days) {
      expect(new Set(d.dueSiteIds)).toEqual(due);
      expect(new Set(d.overdueSiteIds)).toEqual(overdue);
    }
  });
});
