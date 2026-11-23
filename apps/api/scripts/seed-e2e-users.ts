/**
 * Ensures Playwright e2e users and areas exist. Safe to re-run.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/seed-e2e-users.ts
 *
 * Areas:
 *   A «Център», B «Изток», C «Запад»
 *
 * Users:
 *   admin@e2e.local / E2eAdminPass1!   (ADMIN)
 *   office@e2e.local / E2eOfficePass1! (OFFICE)
 *   field@e2e.local / E2eFieldPass1!   (FIELD — areas A + B)
 *   field2@e2e.local / E2eField2Pass1! (FIELD — area C)
 */
import {
  createId,
  EmployeeRoleOnVisit,
  Role,
  ServiceType,
  SubscriptionFrequency,
  VisitStatus,
} from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/auth/password";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

const AREAS = [
  { key: "A", name: "Център" },
  { key: "B", name: "Изток" },
  { key: "C", name: "Запад" },
] as const;

const USERS = [
  {
    email: "admin@e2e.local",
    name: "E2E Admin",
    role: Role.ADMIN,
    password: "E2eAdminPass1!",
    areaKeys: [] as string[],
  },
  {
    email: "office@e2e.local",
    name: "E2E Office",
    role: Role.OFFICE,
    password: "E2eOfficePass1!",
    areaKeys: [] as string[],
  },
  {
    email: "field@e2e.local",
    name: "E2E Field",
    role: Role.FIELD,
    password: "E2eFieldPass1!",
    areaKeys: ["A", "B"],
  },
  {
    email: "field2@e2e.local",
    name: "E2E Field Two",
    role: Role.FIELD,
    password: "E2eField2Pass1!",
    areaKeys: ["C"],
  },
] as const;

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const areaIdByKey = new Map<string, string>();
    for (const area of AREAS) {
      const existing = await prisma.area.findFirst({
        where: { name: { equals: area.name, mode: "insensitive" } },
      });
      if (existing) {
        await prisma.area.update({
          where: { id: existing.id },
          data: { isActive: true, name: area.name },
        });
        areaIdByKey.set(area.key, existing.id);
        console.log(`reset area ${area.name} (exists)`);
        continue;
      }
      const id = createId();
      await prisma.area.create({
        data: { id, name: area.name, isActive: true },
      });
      areaIdByKey.set(area.key, id);
      console.log(`created area ${area.name}`);
    }

    for (const user of USERS) {
      const areaIds = user.areaKeys.map((key) => areaIdByKey.get(key)!);
      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            isActive: true,
            mustChangePassword: false,
            role: user.role,
            name: user.name,
          },
        });
        const current = await prisma.userArea.findMany({
          where: { userId: existing.id },
        });
        const currentSet = new Set(current.map((c) => c.areaId));
        const nextSet = new Set(areaIds);
        for (const row of current) {
          if (!nextSet.has(row.areaId)) {
            await prisma.userArea.delete({ where: { id: row.id } });
          }
        }
        for (const areaId of areaIds) {
          if (!currentSet.has(areaId)) {
            await prisma.userArea.create({
              data: { id: createId(), userId: existing.id, areaId },
            });
          }
        }
        console.log(`reset ${user.email} (exists)`);
        continue;
      }
      const id = createId();
      await prisma.user.create({
        data: {
          id,
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash: await hashPassword(user.password),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
      for (const areaId of areaIds) {
        await prisma.userArea.create({
          data: { id: createId(), userId: id, areaId },
        });
      }
      console.log(`created ${user.email} (${user.role})`);
    }

    // Small fixed set of sites for Playwright (idempotent by notes tag).
    const E2E_SITES_TAG = "__e2e_sites_v1__";
    const siteCount = await prisma.site.count({ where: { notes: E2E_SITES_TAG } });
    if (siteCount === 0) {
      const types = await prisma.siteType.findMany({ take: 3 });
      const clients = await prisma.client.findMany({ take: 3, orderBy: { name: "asc" } });
      if (types.length > 0 && clients.length > 0) {
        const areaList = [...areaIdByKey.values()];
        for (let i = 0; i < Math.min(6, clients.length * 2); i++) {
          await prisma.site.create({
            data: {
              id: createId(),
              clientId: clients[i % clients.length]!.id,
              areaId: areaList[i % areaList.length]!,
              siteTypeId: types[i % types.length]!.id,
              name: `E2E Обект ${i + 1}`,
              address: `ул. Е2Е ${i + 1}, София`,
              latitude: 42.69 + i * 0.01,
              longitude: 23.32 + i * 0.01,
              notes: E2E_SITES_TAG,
            },
          });
        }
        console.log("seeded e2e sites");
      } else {
        console.log("skip e2e sites (need clients + site types)");
      }
    }

    const E2E_SUB_TAG = "__e2e_subscriptions_v1__";
    const subCount = await prisma.subscription.count({ where: { notes: E2E_SUB_TAG } });
    if (subCount === 0) {
      const e2eSites = await prisma.site.findMany({
        where: { notes: E2E_SITES_TAG },
        take: 2,
        orderBy: { name: "asc" },
      });
      if (e2eSites.length >= 1) {
        await prisma.subscription.create({
          data: {
            id: createId(),
            siteId: e2eSites[0]!.id,
            services: [ServiceType.INSECT_CONTROL, ServiceType.RODENT_CONTROL],
            frequency: SubscriptionFrequency.MONTHLY,
            rate: 80,
            rateIncludesVat: true,
            startDate: new Date("2025-01-01T00:00:00.000Z"),
            endDate: null,
            notes: E2E_SUB_TAG,
          },
        });
      }
      if (e2eSites.length >= 2) {
        await prisma.subscription.create({
          data: {
            id: createId(),
            siteId: e2eSites[1]!.id,
            services: [ServiceType.DISINFECTION],
            frequency: SubscriptionFrequency.QUARTERLY,
            rate: 120,
            rateIncludesVat: false,
            startDate: new Date("2024-06-01T00:00:00.000Z"),
            endDate: new Date("2025-05-31T00:00:00.000Z"),
            notes: E2E_SUB_TAG,
          },
        });
        await prisma.subscription.create({
          data: {
            id: createId(),
            siteId: e2eSites[1]!.id,
            services: [ServiceType.DISINFECTION],
            frequency: SubscriptionFrequency.ON_DEMAND,
            rate: 90,
            rateIncludesVat: false,
            startDate: new Date("2025-06-01T00:00:00.000Z"),
            endDate: null,
            notes: E2E_SUB_TAG,
          },
        });
      }
      console.log("seeded e2e subscriptions");
    }

    // 3 visits on one in-scope site for FIELD (area A/B) and 1 on out-of-scope (area C).
    const E2E_VISIT_TAG = "__e2e_visits_v1__";
    const visitCount = await prisma.visit.count({ where: { notes: E2E_VISIT_TAG } });
    if (visitCount === 0) {
      const field = await prisma.user.findUnique({ where: { email: "field@e2e.local" } });
      const office = await prisma.user.findUnique({ where: { email: "office@e2e.local" } });
      const areaA = areaIdByKey.get("A")!;
      const areaC = areaIdByKey.get("C")!;
      const inScope = await prisma.site.findFirst({
        where: { notes: E2E_SITES_TAG, areaId: areaA },
        include: { subscriptions: true },
      });
      const outScope = await prisma.site.findFirst({
        where: { notes: E2E_SITES_TAG, areaId: areaC },
      });
      const actor = field ?? office;
      if (actor && inScope) {
        const sub = inScope.subscriptions[0] ?? null;
        for (let i = 0; i < 3; i++) {
          const visitId = createId();
          // Stagger within the last months (Sofia-safe calendar dates).
          const visitDate = new Date(Date.UTC(2026, 8 + i, 5)); // Sep/Oct/Nov 2026
          // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
          await prisma.$transaction(async (tx) => {
            await tx.visit.create({
              data: {
                id: visitId,
                siteId: inScope.id,
                visitDate,
                treatmentType: ServiceType.INSECT_CONTROL,
                chargedAmount: sub ? Number(sub.rate) : 75,
                rateIncludesVat: sub?.rateIncludesVat ?? false,
                subscriptionId: sub?.id ?? null,
                notes: E2E_VISIT_TAG,
                status: i === 2 ? VisitStatus.CANCELLED : VisitStatus.ACTIVE,
                cancelledAt: i === 2 ? new Date() : null,
                cancelledById: i === 2 ? actor.id : null,
                cancelReason: i === 2 ? "Е2Е анулирано" : null,
                createdById: actor.id,
                clientMutationId: createId(),
              },
            });
            await tx.visitEmployee.create({
              data: {
                id: createId(),
                visitId,
                userId: actor.id,
                roleOnVisit: EmployeeRoleOnVisit.LEAD,
              },
            });
          });
        }
      }
      if (actor && outScope) {
        const visitId = createId();
        // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
        await prisma.$transaction(async (tx) => {
          await tx.visit.create({
            data: {
              id: visitId,
              siteId: outScope.id,
              visitDate: new Date("2026-10-01T00:00:00.000Z"),
              treatmentType: ServiceType.RODENT_CONTROL,
              chargedAmount: 99,
              rateIncludesVat: false,
              subscriptionId: null,
              notes: E2E_VISIT_TAG,
              status: VisitStatus.ACTIVE,
              createdById: actor.id,
              clientMutationId: createId(),
            },
          });
          await tx.visitEmployee.create({
            data: {
              id: createId(),
              visitId,
              userId: actor.id,
              roleOnVisit: EmployeeRoleOnVisit.LEAD,
            },
          });
        });
      }
      console.log("seeded e2e visits");
    }

    // Dedicated «Този месец» dataset for fixed month 2026-11 (Playwright).
    const E2E_MONTH_TAG = "__e2e_month_v1__";
    const monthSiteCount = await prisma.site.count({ where: { notes: E2E_MONTH_TAG } });
    if (monthSiteCount === 0) {
      const types = await prisma.siteType.findMany({ take: 1 });
      const clients = await prisma.client.findMany({ take: 1, orderBy: { name: "asc" } });
      const field = await prisma.user.findUnique({ where: { email: "field@e2e.local" } });
      const areaA = areaIdByKey.get("A");
      if (types[0] && clients[0] && field && areaA) {
        const specs = [
          { name: "E2E Месец Обслужен", kind: "serviced" as const },
          { name: "E2E Месец Предстоящ", kind: "upcoming" as const },
          { name: "E2E Месец Просрочен", kind: "overdue" as const },
        ];
        for (const spec of specs) {
          const siteId = createId();
          await prisma.site.create({
            data: {
              id: siteId,
              clientId: clients[0].id,
              areaId: areaA,
              siteTypeId: types[0].id,
              name: spec.name,
              address: `ул. Месец ${spec.kind}, София`,
              latitude: 42.7,
              longitude: 23.33,
              notes: E2E_MONTH_TAG,
            },
          });
          const frequency =
            spec.kind === "overdue"
              ? SubscriptionFrequency.QUARTERLY
              : SubscriptionFrequency.MONTHLY;
          await prisma.subscription.create({
            data: {
              id: createId(),
              siteId,
              services: [ServiceType.INSECT_CONTROL],
              frequency,
              rate: 70,
              rateIncludesVat: true,
              startDate: new Date("2026-01-01T00:00:00.000Z"),
              endDate: null,
              notes: E2E_MONTH_TAG,
            },
          });
          if (spec.kind === "serviced") {
            const visitId = createId();
            // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
            await prisma.$transaction(async (tx) => {
              await tx.visit.create({
                data: {
                  id: visitId,
                  siteId,
                  visitDate: new Date("2026-11-10T00:00:00.000Z"),
                  treatmentType: ServiceType.INSECT_CONTROL,
                  chargedAmount: 70,
                  rateIncludesVat: true,
                  notes: E2E_MONTH_TAG,
                  status: VisitStatus.ACTIVE,
                  createdById: field.id,
                  clientMutationId: createId(),
                },
              });
              await tx.visitEmployee.create({
                data: {
                  id: createId(),
                  visitId,
                  userId: field.id,
                  roleOnVisit: EmployeeRoleOnVisit.LEAD,
                },
              });
            });
          } else if (spec.kind === "upcoming") {
            const visitId = createId();
            // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
            await prisma.$transaction(async (tx) => {
              await tx.visit.create({
                data: {
                  id: visitId,
                  siteId,
                  visitDate: new Date("2026-10-12T00:00:00.000Z"),
                  treatmentType: ServiceType.INSECT_CONTROL,
                  chargedAmount: 70,
                  rateIncludesVat: true,
                  notes: E2E_MONTH_TAG,
                  status: VisitStatus.ACTIVE,
                  createdById: field.id,
                  clientMutationId: createId(),
                },
              });
              await tx.visitEmployee.create({
                data: {
                  id: createId(),
                  visitId,
                  userId: field.id,
                  roleOnVisit: EmployeeRoleOnVisit.LEAD,
                },
              });
            });
          } else {
            // overdue: quarterly, last visit June → due Sep → Nov overdue by 2
            const visitId = createId();
            // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
            await prisma.$transaction(async (tx) => {
              await tx.visit.create({
                data: {
                  id: visitId,
                  siteId,
                  visitDate: new Date("2026-06-08T00:00:00.000Z"),
                  treatmentType: ServiceType.INSECT_CONTROL,
                  chargedAmount: 70,
                  rateIncludesVat: true,
                  notes: E2E_MONTH_TAG,
                  status: VisitStatus.ACTIVE,
                  createdById: field.id,
                  clientMutationId: createId(),
                },
              });
              await tx.visitEmployee.create({
                data: {
                  id: createId(),
                  visitId,
                  userId: field.id,
                  roleOnVisit: EmployeeRoleOnVisit.LEAD,
                },
              });
            });
          }
        }
        console.log("seeded e2e month sites (2026-11)");
      } else {
        console.log("skip e2e month sites (need clients/types/field)");
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
