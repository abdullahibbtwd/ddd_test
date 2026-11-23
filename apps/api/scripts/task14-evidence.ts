/**
 * Task 14 evidence: seed a fixed 2026-11 month set, then dump
 * GET /api/scheduling/month (all / employee / area) + /month/days.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task14-evidence.ts
 *
 * Writes docs/evidence/task-14/*.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ClientKind,
  createId,
  EmployeeRoleOnVisit,
  Role,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
  VisitStatus,
} from "@ddcrm/shared";
import { loadEnvFiles } from "../src/config/load-env";

const MONTH = "2026-11";
const FIXED_NOW = "2026-11-15T12:00:00.000Z";
const ORIGIN = "http://localhost:5173";
const password = "EvidenceMonthPass1!";

async function main(): Promise<void> {
  loadEnvFiles();
  process.env.SCHEDULING_FIXED_NOW = FIXED_NOW;

  const { startAuthTestApp, stopAuthTestApp, cookieHeader, parseCookies } =
    await import("../test/helpers/auth-app");
  const { hashPassword } = await import("../src/auth/password");

  const ctx = await startAuthTestApp();
  const outDir = resolve(process.cwd(), "../../docs/evidence/task-14");
  mkdirSync(outDir, { recursive: true });

  try {
    await ctx.db.resetDb();
    const hash = await hashPassword(password);

    const areaA = createId();
    const areaB = createId();
    await ctx.db.prisma.area.createMany({
      data: [
        { id: areaA, name: "Evidence Център", isActive: true },
        { id: areaB, name: "Evidence Изток", isActive: true },
      ],
    });

    const siteType =
      (await ctx.db.prisma.siteType.findFirst()) ??
      (await ctx.db.prisma.siteType.create({
        data: { id: createId(), name: "Офис", isActive: true },
      }));

    const clientId = createId();
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: ClientKind.INDIVIDUAL,
        name: "Evidence Месец Клиент",
        nameNormalized: "evidence mesets klient",
        isActive: true,
      },
    });

    const officeId = createId();
    const fieldId = createId();
    const email = "office-t14@evidence.local";
    await ctx.db.prisma.user.createMany({
      data: [
        {
          id: officeId,
          email,
          name: "Evidence Office",
          role: Role.OFFICE,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
        {
          id: fieldId,
          email: "field-t14@evidence.local",
          name: "Evidence Field",
          role: Role.FIELD,
          passwordHash: hash,
          passwordChangedAt: new Date(),
        },
      ],
    });
    await ctx.db.prisma.userArea.create({
      data: { id: createId(), userId: fieldId, areaId: areaA },
    });

    async function site(name: string, areaId: string) {
      const id = createId();
      await ctx.db.prisma.site.create({
        data: {
          id,
          clientId,
          areaId,
          siteTypeId: siteType.id,
          name,
          address: `ул. ${name}`,
          status: SiteStatus.ACTIVE,
        },
      });
      return id;
    }

    async function sub(
      siteId: string,
      frequency: (typeof SubscriptionFrequency)[keyof typeof SubscriptionFrequency],
      startDate: string,
      endDate?: string | null,
    ) {
      await ctx.db.prisma.subscription.create({
        data: {
          id: createId(),
          siteId,
          services: [ServiceType.INSECT_CONTROL],
          frequency,
          rate: 50,
          rateIncludesVat: true,
          startDate: new Date(`${startDate}T00:00:00.000Z`),
          endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
        },
      });
    }

    async function visit(
      siteId: string,
      visitDate: string,
      leadId: string,
    ) {
      const visitId = createId();
      await ctx.db.prisma.visit.create({
        data: {
          id: visitId,
          siteId,
          visitDate: new Date(`${visitDate}T00:00:00.000Z`),
          treatmentType: ServiceType.INSECT_CONTROL,
          chargedAmount: 50,
          rateIncludesVat: true,
          status: VisitStatus.ACTIVE,
          createdById: leadId,
          clientMutationId: createId(),
          employees: {
            create: {
              id: createId(),
              userId: leadId,
              roleOnVisit: EmployeeRoleOnVisit.LEAD,
            },
          },
        },
      });
    }

    const serviced = await site("Evidence SERVICED", areaA);
    await sub(serviced, SubscriptionFrequency.MONTHLY, "2026-01-01");
    await visit(serviced, "2026-11-05", fieldId);

    const upcoming = await site("Evidence UPCOMING", areaA);
    await sub(upcoming, SubscriptionFrequency.MONTHLY, "2026-01-01");
    await visit(upcoming, "2026-10-10", officeId);

    const overdue = await site("Evidence OVERDUE", areaA);
    await sub(overdue, SubscriptionFrequency.QUARTERLY, "2026-01-01");
    await visit(overdue, "2026-06-10", fieldId);

    const ended = await site("Evidence ENDED", areaA);
    await sub(ended, SubscriptionFrequency.MONTHLY, "2025-01-01", "2026-10-31");

    const notStarted = await site("Evidence NOT_STARTED", areaA);
    await sub(notStarted, SubscriptionFrequency.MONTHLY, "2026-12-01");

    const onDemand = await site("Evidence ON_DEMAND", areaA);
    await sub(onDemand, SubscriptionFrequency.ON_DEMAND, "2026-01-01");

    await site("Evidence NO_SUB", areaA);

    const areaBSite = await site("Evidence AREA B", areaB);
    await sub(areaBSite, SubscriptionFrequency.MONTHLY, "2026-01-01");

    const login = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { email, password },
    });
    if (login.statusCode !== 200) {
      throw new Error(`login failed: ${login.statusCode} ${login.body}`);
    }
    const raw = login.headers["set-cookie"];
    const cookies = parseCookies(
      !raw ? [] : Array.isArray(raw) ? (raw as string[]) : [String(raw)],
    );

    async function dump(label: string, url: string) {
      const res = await ctx.inject({
        method: "GET",
        url,
        headers: { origin: ORIGIN, cookie: cookieHeader(cookies) },
      });
      const path = resolve(outDir, `${label}.json`);
      const pretty = JSON.stringify(JSON.parse(res.body), null, 2) + "\n";
      writeFileSync(path, pretty, "utf8");
      console.log(`wrote ${path} (${res.statusCode})`);
      return JSON.parse(res.body) as {
        summary?: unknown;
        rows?: unknown[];
        total?: number;
        filter?: unknown;
        days?: unknown[];
      };
    }

    const all = await dump(
      "month-all",
      `/api/scheduling/month?month=${MONTH}&pageSize=100`,
    );
    console.log("summary:", JSON.stringify(all.summary, null, 2));
    console.log("total:", all.total);

    await dump(
      "month-employee",
      `/api/scheduling/month?month=${MONTH}&employeeId=${fieldId}&pageSize=100`,
    );
    await dump(
      "month-area",
      `/api/scheduling/month?month=${MONTH}&areaId=${areaB}&pageSize=100`,
    );
    await dump(
      "month-days",
      `/api/scheduling/month/days?month=${MONTH}`,
    );

    console.log("\n=== Task 14 evidence OK (no mutations / no audit writes) ===");
  } finally {
    await stopAuthTestApp(ctx);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
