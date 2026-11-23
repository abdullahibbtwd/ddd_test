/**
 * Seeds ~60 sites across the 3 seeded areas and existing clients,
 * plus subscriptions on ~40 of them.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/seed-dev-sites.ts
 */
import {
  createId,
  EmployeeRoleOnVisit,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
  VisitStatus,
} from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

const NOTES_TAG = "__dev_sites_v1__";
const SUB_NOTES_TAG = "__dev_subscriptions_v1__";
const VISIT_NOTES_TAG = "__dev_visits_v1__";

const CITY_COORDS = {
  sofia: { lat: 42.6977, lng: 23.3219, areaName: "Център" },
  plovdiv: { lat: 42.1354, lng: 24.7453, areaName: "Изток" },
  varna: { lat: 43.2141, lng: 27.9147, areaName: "Запад" },
} as const;

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  try {
    const existing = await prisma.site.count({ where: { notes: NOTES_TAG } });
    if (existing >= 50) {
      console.log(`dev sites already seeded (${existing})`);
    } else {
      const types = await prisma.siteType.findMany({ orderBy: { name: "asc" } });
      if (types.length === 0) throw new Error("No site types — run migrations first");

      const areas = await prisma.area.findMany({ where: { isActive: true } });
      const areaByName = new Map(areas.map((a) => [a.name, a]));
      const clients = await prisma.client.findMany({
        where: { isActive: true, notes: { not: "__perf_seed_v1__" } },
        take: 40,
        orderBy: { name: "asc" },
      });
      if (clients.length === 0) {
        throw new Error("No clients — run seed-dev-clients.ts first");
      }

      const cities = Object.values(CITY_COORDS);
      let created = 0;
      for (let i = 0; i < 60; i++) {
        const city = cities[i % cities.length]!;
        const area = areaByName.get(city.areaName) ?? areas[i % areas.length]!;
        const client = clients[i % clients.length]!;
        const type = types[i % types.length]!;
        const noCoords = i % 11 === 0;
        const terminated = i % 13 === 0;
        const jitter = ((i % 7) - 3) * 0.01;
        await prisma.site.create({
          data: {
            id: createId(),
            clientId: client.id,
            areaId: area.id,
            siteTypeId: type.id,
            name: `${client.name} — обект ${i + 1}`,
            address: `ул. Примерна ${10 + i}, ${city.areaName === "Център" ? "София" : city.areaName === "Изток" ? "Пловдив" : "Варна"}`,
            latitude: noCoords ? null : city.lat + jitter,
            longitude: noCoords ? null : city.lng + jitter,
            monitoringPointsCount: i % 5,
            status: terminated ? SiteStatus.TERMINATED : SiteStatus.ACTIVE,
            terminatedAt: terminated ? new Date() : null,
            notes: NOTES_TAG,
          },
        });
        created++;
      }
      console.log(`created ${created} dev sites`);
    }

    const subExisting = await prisma.subscription.count({
      where: { notes: SUB_NOTES_TAG },
    });
    if (subExisting >= 30) {
      console.log(`dev subscriptions already seeded (${subExisting})`);
    } else {
      const sites = await prisma.site.findMany({
        where: { notes: NOTES_TAG, status: SiteStatus.ACTIVE },
        orderBy: { name: "asc" },
        take: 60,
      });

      const frequencies = [
        SubscriptionFrequency.MONTHLY,
        SubscriptionFrequency.EVERY_2_MONTHS,
        SubscriptionFrequency.QUARTERLY,
        SubscriptionFrequency.ON_DEMAND,
      ] as const;
      const serviceSets = [
        [ServiceType.INSECT_CONTROL],
        [ServiceType.RODENT_CONTROL],
        [ServiceType.DISINFECTION],
        [ServiceType.INSECT_CONTROL, ServiceType.RODENT_CONTROL],
        [ServiceType.INSECT_CONTROL, ServiceType.DISINFECTION, ServiceType.OTHER],
      ] as const;

      let subsCreated = 0;
      // ~40 of the sites get a subscription; a couple get past+current history.
      for (let i = 0; i < Math.min(40, sites.length); i++) {
        const site = sites[i]!;
        const frequency = frequencies[i % frequencies.length]!;
        const services = [...serviceSets[i % serviceSets.length]!];
        const rate = 40 + (i % 17) * 5.5;
        const rateIncludesVat = i % 3 === 0;
        const endedOnly = i % 11 === 0;

        if (i < 2) {
          // Past ended + current open for the first two sites.
          await prisma.subscription.create({
            data: {
              id: createId(),
              siteId: site.id,
              services,
              frequency,
              rate: rate - 10,
              rateIncludesVat: false,
              startDate: new Date("2024-01-01T00:00:00.000Z"),
              endDate: new Date("2025-06-30T00:00:00.000Z"),
              notes: SUB_NOTES_TAG,
            },
          });
          await prisma.subscription.create({
            data: {
              id: createId(),
              siteId: site.id,
              services,
              frequency,
              rate,
              rateIncludesVat,
              startDate: new Date("2025-07-01T00:00:00.000Z"),
              endDate: null,
              notes: SUB_NOTES_TAG,
            },
          });
          subsCreated += 2;
          continue;
        }

        await prisma.subscription.create({
          data: {
            id: createId(),
            siteId: site.id,
            services,
            frequency,
            rate,
            rateIncludesVat,
            startDate: new Date("2025-01-15T00:00:00.000Z"),
            endDate: endedOnly ? new Date("2025-12-31T00:00:00.000Z") : null,
            notes: SUB_NOTES_TAG,
          },
        });
        subsCreated += 1;
      }
      console.log(`created ${subsCreated} dev subscriptions`);
    }

    const visitExisting = await prisma.visit.count({
      where: { notes: VISIT_NOTES_TAG },
    });
    if (visitExisting >= 50) {
      console.log(`dev visits already seeded (${visitExisting})`);
    } else {
      const actors = await prisma.user.findMany({
        where: { isActive: true },
        orderBy: { email: "asc" },
        take: 8,
      });
      if (actors.length === 0) {
        console.log("skip visits — no users");
      } else {
        const sites = await prisma.site.findMany({
          where: { notes: NOTES_TAG, status: SiteStatus.ACTIVE },
          include: { subscriptions: true },
          orderBy: { name: "asc" },
          take: 60,
        });
        // ~25 of 60 sites get a handful of visits over the last 6 months.
        const targetSites = sites.slice(0, 25);
        const types = [
          ServiceType.INSECT_CONTROL,
          ServiceType.RODENT_CONTROL,
          ServiceType.DISINFECTION,
          ServiceType.OTHER,
        ] as const;
        let visitsCreated = 0;
        const today = new Date();
        for (let i = 0; i < targetSites.length; i++) {
          const site = targetSites[i]!;
          const visitCount = 2 + (i % 3); // 2–4 visits
          for (let v = 0; v < visitCount; v++) {
            const daysAgo = 10 + i * 3 + v * 17;
            const visitDate = new Date(
              Date.UTC(
                today.getUTCFullYear(),
                today.getUTCMonth(),
                today.getUTCDate() - daysAgo,
              ),
            );
            const visitDateStr = visitDate.toISOString().slice(0, 10);
            const matchingSub =
              site.subscriptions.find((s) => {
                const start = s.startDate.toISOString().slice(0, 10);
                const end = s.endDate ? s.endDate.toISOString().slice(0, 10) : null;
                return start <= visitDateStr && (end === null || end >= visitDateStr);
              }) ?? null;
            // A few one-off (no subscription): every 5th site's first visit.
            const oneOff = i % 5 === 0 && v === 0;
            const actor = actors[i % actors.length]!;
            const assist = actors[(i + 1) % actors.length]!;
            const cancelled = i % 7 === 0 && v === 0;
            // One visit with actor as ASSIST and someone else LEAD.
            const actorAssist = i === 3 && v === 0;
            const visitId = createId();
            const lead = actorAssist ? assist : actor;
            const second = actorAssist ? actor : i % 4 === 0 ? assist : null;

            // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
            await prisma.$transaction(async (tx) => {
              await tx.visit.create({
                data: {
                  id: visitId,
                  siteId: site.id,
                  visitDate,
                  treatmentType: types[(i + v) % types.length]!,
                  chargedAmount: oneOff || !matchingSub ? 55 + i : Number(matchingSub.rate),
                  rateIncludesVat: oneOff || !matchingSub ? false : matchingSub.rateIncludesVat,
                  subscriptionId: oneOff ? null : (matchingSub?.id ?? null),
                  notes: VISIT_NOTES_TAG,
                  status: cancelled ? VisitStatus.CANCELLED : VisitStatus.ACTIVE,
                  cancelledAt: cancelled ? new Date() : null,
                  cancelledById: cancelled ? actor.id : null,
                  cancelReason: cancelled ? "Отменено от клиента" : null,
                  createdById: actor.id,
                  clientMutationId: createId(),
                },
              });
              await tx.visitEmployee.create({
                data: {
                  id: createId(),
                  visitId,
                  userId: lead.id,
                  roleOnVisit: EmployeeRoleOnVisit.LEAD,
                },
              });
              if (second && second.id !== lead.id) {
                await tx.visitEmployee.create({
                  data: {
                    id: createId(),
                    visitId,
                    userId: second.id,
                    roleOnVisit: EmployeeRoleOnVisit.ASSIST,
                  },
                });
              }
            });
            visitsCreated += 1;
          }
        }
        console.log(`created ${visitsCreated} dev visits`);
      }
    }

    // Fixed reference month 2026-11 for «Този месец» (deterministic clock).
    const MONTH_TAG = "__dev_month_2026_11__";
    const REF_MONTH = "2026-11";
    process.env.SCHEDULING_FIXED_NOW = "2026-11-15T12:00:00.000Z";
    const monthExisting = await prisma.site.count({ where: { notes: MONTH_TAG } });
    if (monthExisting >= 50) {
      console.log(`dev month ${REF_MONTH} already seeded (${monthExisting})`);
    } else {
      const types = await prisma.siteType.findMany({ orderBy: { name: "asc" } });
      const areas = await prisma.area.findMany({ where: { isActive: true } });
      const clients = await prisma.client.findMany({
        where: { isActive: true, notes: { not: "__perf_seed_v1__" } },
        take: 20,
        orderBy: { name: "asc" },
      });
      const actors = await prisma.user.findMany({
        where: { isActive: true },
        take: 5,
        orderBy: { email: "asc" },
      });
      if (types.length === 0 || areas.length === 0 || clients.length === 0 || actors.length === 0) {
        console.log("skip month seed — need types/areas/clients/users");
      } else {
        const plan: {
          status: string;
          count: number;
          frequency: (typeof SubscriptionFrequency)[keyof typeof SubscriptionFrequency];
          startDate: string;
          endDate?: string | null;
          lastVisit?: string | null;
          visitThisMonth?: string | null;
        }[] = [
          {
            status: "SERVICED",
            count: 20,
            frequency: SubscriptionFrequency.MONTHLY,
            startDate: "2026-01-01",
            visitThisMonth: "2026-11-05",
          },
          {
            status: "UPCOMING",
            count: 15,
            frequency: SubscriptionFrequency.MONTHLY,
            startDate: "2026-01-01",
            lastVisit: "2026-10-10",
          },
          {
            status: "OVERDUE",
            count: 8,
            frequency: SubscriptionFrequency.QUARTERLY,
            startDate: "2026-01-01",
            lastVisit: "2026-06-10",
          },
          {
            status: "ENDED",
            count: 3,
            frequency: SubscriptionFrequency.MONTHLY,
            startDate: "2025-01-01",
            endDate: "2026-10-31",
          },
          {
            status: "NOT_STARTED",
            count: 3,
            frequency: SubscriptionFrequency.MONTHLY,
            startDate: "2026-12-01",
          },
          {
            status: "ON_DEMAND",
            count: 4,
            frequency: SubscriptionFrequency.ON_DEMAND,
            startDate: "2026-01-01",
          },
          { status: "NO_SUB", count: 10, frequency: SubscriptionFrequency.MONTHLY, startDate: "2026-01-01" },
        ];

        let n = 0;
        for (const bucket of plan) {
          for (let i = 0; i < bucket.count; i++) {
            n += 1;
            const siteId = createId();
            const client = clients[n % clients.length]!;
            const area = areas[n % areas.length]!;
            const type = types[n % types.length]!;
            const actor = actors[n % actors.length]!;
            await prisma.site.create({
              data: {
                id: siteId,
                clientId: client.id,
                areaId: area.id,
                siteTypeId: type.id,
                name: `Месец ${bucket.status} ${String(i + 1).padStart(2, "0")}`,
                address: `ул. Месец ${n}, София`,
                status: SiteStatus.ACTIVE,
                notes: MONTH_TAG,
              },
            });
            if (bucket.status === "NO_SUB") continue;
            await prisma.subscription.create({
              data: {
                id: createId(),
                siteId,
                services: [ServiceType.INSECT_CONTROL],
                frequency: bucket.frequency,
                rate: 60,
                rateIncludesVat: true,
                startDate: new Date(`${bucket.startDate}T00:00:00.000Z`),
                endDate: bucket.endDate
                  ? new Date(`${bucket.endDate}T00:00:00.000Z`)
                  : null,
                notes: MONTH_TAG,
              },
            });
            const visitDate = bucket.visitThisMonth ?? bucket.lastVisit;
            if (visitDate) {
              const visitId = createId();
              // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
              await prisma.$transaction(async (tx) => {
                await tx.visit.create({
                  data: {
                    id: visitId,
                    siteId,
                    visitDate: new Date(`${visitDate}T00:00:00.000Z`),
                    treatmentType: ServiceType.INSECT_CONTROL,
                    chargedAmount: 60,
                    rateIncludesVat: true,
                    notes: MONTH_TAG,
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
          }
        }
        console.log(`created ${n} sites for month ${REF_MONTH} (${MONTH_TAG})`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
