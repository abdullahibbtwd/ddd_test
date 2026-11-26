/**
 * Seeds ~60 sites across the 3 seeded areas and existing clients,
 * plus subscriptions on ~40 of them.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/seed-dev-sites.ts
 */
import {
  addCalendarMonths,
  AgreementStatus,
  buildLineAmounts,
  createId,
  CURRENCY,
  DocumentType,
  EmployeeRoleOnVisit,
  FoodResultStatus,
  formatInvoiceNumber,
  InvoiceStatus,
  NotificationKind,
  NotificationPriority,
  NotificationRecipientType,
  Role,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
  todayInSofia,
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

    // Invoices (Task 15): ~15 drafts + ~30 issued across 3 clients.
    const INV_TAG = "__dev_invoices_v1__";
    const invExisting = await prisma.invoice.count({ where: { notes: INV_TAG } });
    if (invExisting >= 40) {
      console.log(`dev invoices already seeded (${invExisting})`);
    } else {
      const clients = await prisma.client.findMany({
        where: { isActive: true, notes: { not: "__perf_seed_v1__" } },
        take: 3,
        orderBy: { name: "asc" },
      });
      const actor =
        (await prisma.user.findFirst({
          where: { isActive: true, role: { in: [Role.ADMIN, Role.OFFICE] } },
          orderBy: { email: "asc" },
        })) ??
        (await prisma.user.findFirst({ where: { isActive: true }, orderBy: { email: "asc" } }));
      if (clients.length < 3 || !actor) {
        console.log("skip invoice seed — need ≥3 clients and a user");
      } else {
        const vatRates = ["20.00", "9.00", "0.00"] as const;
        let drafts = 0;
        for (let i = 0; i < 15; i++) {
          const client = clients[i % 3]!;
          const invoiceId = createId();
          const lineCount = i % 4; // 0–3 lines (some empty drafts)
          await prisma.invoice.create({
            data: {
              id: invoiceId,
              status: InvoiceStatus.DRAFT,
              documentType: DocumentType.INVOICE,
              clientId: client.id,
              currency: CURRENCY,
              netAmount: "0.00",
              vatAmount: "0.00",
              grossAmount: "0.00",
              notes: INV_TAG,
              billingMonth: new Date("2026-08-01T00:00:00.000Z"),
              createdById: actor.id,
            },
          });
          for (let L = 0; L < lineCount; L++) {
            const line = {
              description: `Чернова ред ${i + 1}.${L + 1}`,
              quantity: "1.000",
              unitPrice: (40 + i + L * 10).toFixed(2),
              vatRate: vatRates[L % vatRates.length]!,
            };
            const amounts = buildLineAmounts(line);
            await prisma.invoiceLine.create({
              data: {
                id: createId(),
                invoiceId,
                lineNo: L + 1,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                vatRate: line.vatRate,
                lineTotal: amounts.lineTotal,
                vatAmount: amounts.vatAmount,
              },
            });
          }
          drafts += 1;
        }

        // Active visits not yet on an invoice, for issued visit links (no doubles).
        const freeVisits = await prisma.visit.findMany({
          where: {
            status: VisitStatus.ACTIVE,
            invoiceLinks: { none: {} },
            site: { clientId: { in: clients.map((c) => c.id) } },
          },
          include: { site: { select: { clientId: true, name: true } } },
          take: 40,
          orderBy: { visitDate: "asc" },
        });
        let visitCursor = 0;

        const counter = await prisma.invoiceCounter.findUniqueOrThrow({
          where: { id: "default" },
        });
        let nextNum = counter.nextValue;
        let issued = 0;
        for (let i = 0; i < 30; i++) {
          const client = clients[i % 3]!;
          const invoiceId = createId();
          const number = formatInvoiceNumber(nextNum);
          nextNum += 1;
          const lineSpecs = [
            {
              description: `Услуга ${i + 1}A`,
              quantity: "1.000",
              unitPrice: (50 + (i % 7) * 5).toFixed(2),
              vatRate: vatRates[i % 3]!,
            },
            ...(i % 3 === 0
              ? [
                  {
                    description: `Услуга ${i + 1}B`,
                    quantity: "2.000",
                    unitPrice: "15.00",
                    vatRate: vatRates[(i + 1) % 3]!,
                  },
                ]
              : []),
          ];
          let net = 0;
          let vat = 0;
          const lineRows = lineSpecs.map((line, idx) => {
            const amounts = buildLineAmounts(line);
            net += Number(amounts.lineTotal);
            vat += Number(amounts.vatAmount);
            return {
              id: createId(),
              invoiceId,
              lineNo: idx + 1,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              lineTotal: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
            };
          });
          const issuedAt = new Date();
          const due = new Date(issuedAt);
          due.setUTCDate(due.getUTCDate() + 30);
          await prisma.invoice.create({
            data: {
              id: invoiceId,
              number,
              status: InvoiceStatus.ISSUED,
              documentType: DocumentType.INVOICE,
              clientId: client.id,
              issuedAt,
              issuedById: actor.id,
              clientLegalName: client.name,
              clientEik: client.eik ?? "",
              clientVatNumber: client.vatNumber ?? "",
              clientRegisteredAddress: client.registeredAddress ?? "",
              clientLegalRepresentative: client.legalRepresentative ?? "",
              clientEmail: client.email,
              clientPhone: client.phone,
              currency: CURRENCY,
              netAmount: net.toFixed(2),
              vatAmount: vat.toFixed(2),
              grossAmount: (net + vat).toFixed(2),
              notes: INV_TAG,
              billingMonth: new Date("2026-09-01T00:00:00.000Z"),
              dueDate: due,
              createdById: actor.id,
            },
          });
          await prisma.invoiceLine.createMany({ data: lineRows });

          // Link at most one free visit belonging to this client (no doubles).
          while (visitCursor < freeVisits.length) {
            const visit = freeVisits[visitCursor]!;
            visitCursor += 1;
            if (visit.site.clientId !== client.id) continue;
            await prisma.invoiceVisit.create({
              data: { id: createId(), invoiceId, visitId: visit.id },
            });
            break;
          }
          issued += 1;
        }

        await prisma.invoiceCounter.update({
          where: { id: "default" },
          data: { nextValue: nextNum },
        });
        console.log(
          `created ${drafts} draft + ${issued} issued invoices (counter next=${nextNum})`,
        );
      }
    }

    // Task 16: credit notes, debit note, email events, batch-eligible month
    const DOC_TAG = "__dev_invoice_docs_v1__";
    const docExisting = await prisma.invoice.count({
      where: { notes: DOC_TAG, documentType: { in: [DocumentType.CREDIT_NOTE, DocumentType.DEBIT_NOTE] } },
    });
    if (docExisting >= 4) {
      console.log(`dev invoice docs already seeded (${docExisting})`);
    } else {
      const actor =
        (await prisma.user.findFirst({
          where: { isActive: true, role: { in: [Role.ADMIN, Role.OFFICE] } },
          orderBy: { email: "asc" },
        })) ?? null;
      const issuedInvoices = await prisma.invoice.findMany({
        where: {
          status: InvoiceStatus.ISSUED,
          documentType: DocumentType.INVOICE,
          notes: "__dev_invoices_v1__",
        },
        include: { lines: { orderBy: { lineNo: "asc" } } },
        take: 6,
        orderBy: { number: "asc" },
      });
      if (actor && issuedInvoices.length >= 5) {
        const counter = await prisma.invoiceCounter.findUniqueOrThrow({
          where: { id: "default" },
        });
        let nextNum = counter.nextValue;

        // 3 credit notes
        for (let i = 0; i < 3; i++) {
          const original = issuedInvoices[i]!;
          const line = original.lines[0]!;
          const noteId = createId();
          const number = formatInvoiceNumber(nextNum);
          nextNum += 1;
          await prisma.invoice.create({
            data: {
              id: noteId,
              number,
              status: InvoiceStatus.ISSUED,
              documentType: DocumentType.CREDIT_NOTE,
              clientId: original.clientId,
              issuedAt: new Date(),
              issuedById: actor.id,
              clientLegalName: original.clientLegalName,
              clientEik: original.clientEik,
              clientVatNumber: original.clientVatNumber,
              clientRegisteredAddress: original.clientRegisteredAddress,
              clientLegalRepresentative: original.clientLegalRepresentative,
              clientEmail: original.clientEmail,
              clientPhone: original.clientPhone,
              currency: original.currency,
              netAmount: line.lineTotal,
              vatAmount: line.vatAmount,
              grossAmount: original.grossAmount,
              referencesInvoiceId: original.id,
              creditNoteReason: `Корекция на фактура ${original.number}`,
              notes: DOC_TAG,
              dueDate: original.dueDate,
              createdById: actor.id,
            },
          });
          await prisma.invoiceLine.create({
            data: {
              id: createId(),
              invoiceId: noteId,
              lineNo: 1,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              lineTotal: line.lineTotal,
              vatAmount: line.vatAmount,
            },
          });
        }

        // 1 debit note (original stays ISSUED)
        {
          const original = issuedInvoices[3]!;
          const line = original.lines[0]!;
          const noteId = createId();
          const number = formatInvoiceNumber(nextNum);
          nextNum += 1;
          await prisma.invoice.create({
            data: {
              id: noteId,
              number,
              status: InvoiceStatus.ISSUED,
              documentType: DocumentType.DEBIT_NOTE,
              clientId: original.clientId,
              issuedAt: new Date(),
              issuedById: actor.id,
              clientLegalName: original.clientLegalName,
              clientEik: original.clientEik,
              clientVatNumber: original.clientVatNumber,
              clientRegisteredAddress: original.clientRegisteredAddress,
              clientLegalRepresentative: original.clientLegalRepresentative,
              clientEmail: original.clientEmail,
              clientPhone: original.clientPhone,
              currency: original.currency,
              netAmount: line.lineTotal,
              vatAmount: line.vatAmount,
              grossAmount: original.grossAmount,
              referencesInvoiceId: original.id,
              notes: DOC_TAG,
              dueDate: original.dueDate,
              createdById: actor.id,
            },
          });
          await prisma.invoiceLine.create({
            data: {
              id: createId(),
              invoiceId: noteId,
              lineNo: 1,
              description: `Доплащане — ${line.description}`,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              lineTotal: line.lineTotal,
              vatAmount: line.vatAmount,
            },
          });
        }

        // 2 email_events (sent + failed) on remaining issued invoices
        const emailTargets = issuedInvoices.slice(4, 6);
        if (emailTargets[0]) {
          await prisma.emailEvent.create({
            data: {
              id: createId(),
              invoiceId: emailTargets[0].id,
              toAddress: emailTargets[0].clientEmail ?? "sent@example.bg",
              sentAt: new Date(),
              jobId: `invoice_email_${emailTargets[0].id}_1`,
            },
          });
          await prisma.invoice.update({
            where: { id: emailTargets[0].id },
            data: { emailSentAt: new Date() },
          });
        }
        if (emailTargets[1]) {
          await prisma.emailEvent.create({
            data: {
              id: createId(),
              invoiceId: emailTargets[1].id,
              toAddress: emailTargets[1].clientEmail ?? "fail@example.bg",
              failedAt: new Date(),
              error: "SMTP connection refused (seed)",
              jobId: `invoice_email_${emailTargets[1].id}_1`,
            },
          });
          await prisma.invoice.update({
            where: { id: emailTargets[1].id },
            data: { emailLastError: "SMTP connection refused (seed)" },
          });
        }

        await prisma.invoiceCounter.update({
          where: { id: "default" },
          data: { nextValue: nextNum },
        });
        console.log("seeded credit/debit notes + email_events");
      }

      // Batch-eligible month: 8 ACTIVE sites with current subscription, no invoice for month
      const BATCH_MONTH = new Date("2027-03-01T00:00:00.000Z");
      const BATCH_TAG = "__dev_batch_eligible_v1__";
      const batchSites = await prisma.site.count({ where: { notes: BATCH_TAG } });
      if (batchSites < 8 && actor) {
        const area = await prisma.area.findFirst({ where: { isActive: true } });
        const siteType = await prisma.siteType.findFirst();
        const client = await prisma.client.findFirst({ where: { isActive: true } });
        if (area && siteType && client) {
          for (let i = 0; i < 8; i++) {
            const siteId = createId();
            await prisma.site.create({
              data: {
                id: siteId,
                clientId: client.id,
                areaId: area.id,
                siteTypeId: siteType.id,
                name: `Пакет Обект ${i + 1}`,
                address: `ул. Пакетна ${i + 1}`,
                status: SiteStatus.ACTIVE,
                notes: BATCH_TAG,
              },
            });
            await prisma.subscription.create({
              data: {
                id: createId(),
                siteId,
                services: [ServiceType.INSECT_CONTROL],
                frequency: SubscriptionFrequency.MONTHLY,
                rate: 80 + i,
                rateIncludesVat: false,
                startDate: new Date("2027-01-01T00:00:00.000Z"),
                endDate: null,
                notes: BATCH_TAG,
              },
            });
          }
          console.log(`seeded 8 batch-eligible sites for ${BATCH_MONTH.toISOString().slice(0, 7)}`);
        }
      }
    }

    // Task 17: sample payments, cash handovers, overdue unpaid, reminder event
    const PAY_TAG = "__dev_payments_v1__";
    const payCount = await prisma.payment.count({
      where: { notes: PAY_TAG },
    });
    if (payCount >= 4) {
      console.log(`dev payments already seeded (${payCount})`);
    } else {
      const actor =
        (await prisma.user.findFirst({
          where: { isActive: true, role: { in: [Role.ADMIN, Role.OFFICE] } },
          orderBy: { email: "asc" },
        })) ?? null;
      const field =
        (await prisma.user.findFirst({
          where: { isActive: true, role: Role.FIELD },
          orderBy: { email: "asc" },
        })) ?? null;
      const issued = await prisma.invoice.findMany({
        where: {
          status: InvoiceStatus.ISSUED,
          documentType: DocumentType.INVOICE,
          notes: "__dev_invoices_v1__",
        },
        orderBy: { number: "asc" },
        take: 8,
      });
      if (actor && field && issued.length >= 5) {
        // Partial payments on first 3
        for (let i = 0; i < 3; i++) {
          const inv = issued[i]!;
          await prisma.payment.create({
            data: {
              id: createId(),
              invoiceId: inv.id,
              amount: "25.00",
              method: i === 0 ? "CASH" : i === 1 ? "BANK_TRANSFER" : "CARD",
              paidAt: new Date(),
              collectedByUserId: i === 0 ? field.id : null,
              notes: PAY_TAG,
              createdById: actor.id,
            },
          });
        }
        // Fully pay one invoice (cap to outstanding)
        {
          const inv = issued[3]!;
          const paid = await prisma.payment.aggregate({
            where: { invoiceId: inv.id },
            _sum: { amount: true },
          });
          const paidSum = Number(paid._sum.amount ?? 0);
          const remain = Math.max(0, Number(inv.grossAmount) - paidSum);
          if (remain > 0) {
            await prisma.payment.create({
              data: {
                id: createId(),
                invoiceId: inv.id,
                amount: remain.toFixed(2),
                method: "BANK_TRANSFER",
                paidAt: new Date(),
                notes: PAY_TAG,
                createdById: actor.id,
              },
            });
          }
        }
        // Overdue unpaid: backdate due_date on one unpaid invoice
        {
          const inv = issued[4]!;
          // eslint-disable-next-line no-restricted-syntax -- seed overdue fixture
          await prisma.$executeRawUnsafe(`
            ALTER TABLE invoices DISABLE TRIGGER trg_invoices_reject_issued_mutation;
            UPDATE invoices SET due_date = DATE '2020-01-01' WHERE id = '${inv.id}'::uuid;
            ALTER TABLE invoices ENABLE TRIGGER trg_invoices_reject_issued_mutation;
          `);
          await prisma.emailEvent.create({
            data: {
              id: createId(),
              invoiceId: inv.id,
              kind: "REMINDER",
              toAddress: inv.clientEmail ?? "reminder@example.bg",
              sentAt: new Date(),
              jobId: `invoice_reminder_${inv.id}_1`,
            },
          });
        }
        // Cash handover (may leave negative outstanding — legal)
        const cashCollected = await prisma.payment.aggregate({
          where: { method: "CASH", collectedByUserId: field.id },
          _sum: { amount: true },
        });
        const cashSum = Number(cashCollected._sum.amount ?? 0);
        if (cashSum > 0) {
          await prisma.cashHandover.create({
            data: {
              id: createId(),
              employeeId: field.id,
              amount: (cashSum + 10).toFixed(2),
              handedOverAt: new Date(),
              receivedByUserId: actor.id,
              notes: PAY_TAG,
              createdById: actor.id,
            },
          });
        } else {
          // Ensure at least one cash payment + handover for ledger demos
          const inv = issued[5] ?? issued[0]!;
          await prisma.payment.create({
            data: {
              id: createId(),
              invoiceId: inv.id,
              amount: "15.00",
              method: "CASH",
              paidAt: new Date(),
              collectedByUserId: field.id,
              notes: PAY_TAG,
              createdById: actor.id,
            },
          });
          await prisma.cashHandover.create({
            data: {
              id: createId(),
              employeeId: field.id,
              amount: "20.00",
              handedOverAt: new Date(),
              receivedByUserId: actor.id,
              notes: PAY_TAG,
              createdById: actor.id,
            },
          });
        }
        console.log("seeded payments, overdue reminder event, cash handover");
      } else {
        console.log("skip payment seed — need issued invoices + field user");
      }
    }

    // --- Task 18: products, visit_products, monitoring points/checks ---
    const PRODUCT_TAG = "__dev_products_v1__";
    const productCount = await prisma.product.count({
      where: { recommendations: PRODUCT_TAG },
    });
    if (productCount >= 12) {
      console.log(`dev products already seeded (${productCount})`);
    } else {
      const actor =
        (await prisma.user.findFirst({ where: { role: Role.OFFICE } })) ??
        (await prisma.user.findFirst({ where: { role: Role.ADMIN } }));
      if (!actor) throw new Error("No OFFICE/ADMIN user for product seed");

      const defs: Array<{
        name: string;
        formulation: "LIQUID" | "POWDER" | "GEL" | "BAIT" | "TRAP" | "AEROSOL" | "OTHER";
        substances: string[];
        unit: "G" | "KG" | "ML" | "L" | "PIECE";
        archived?: boolean;
      }> = [
        { name: "Инсектицид А", formulation: "LIQUID", substances: ["цифлутрин"], unit: "ML" },
        { name: "Инсектицид Б", formulation: "AEROSOL", substances: ["пиретрин"], unit: "ML" },
        { name: "Инсектицид В", formulation: "POWDER", substances: ["боратна киселина"], unit: "G" },
        { name: "Родентицид А", formulation: "BAIT", substances: ["бродифакум"], unit: "G" },
        { name: "Родентицид Б", formulation: "BAIT", substances: ["бромадиолон"], unit: "G" },
        { name: "Родентицид В", formulation: "GEL", substances: ["дифенакум"], unit: "G" },
        { name: "Дезинфектант А", formulation: "LIQUID", substances: ["хипохлорит"], unit: "L" },
        { name: "Дезинфектант Б", formulation: "LIQUID", substances: ["кватернерни амониеви"], unit: "L" },
        { name: "Дезинфектант В", formulation: "POWDER", substances: ["натриев перкарбонат"], unit: "KG" },
        { name: "Ларвицид А", formulation: "LIQUID", substances: ["дифлубензурон"], unit: "ML" },
        { name: "Ларвицид Б (архив)", formulation: "OTHER", substances: ["метопрен"], unit: "ML", archived: true },
        { name: "Капан тип А (архив)", formulation: "TRAP", substances: [], unit: "PIECE", archived: true },
      ];

      const productIds: string[] = [];
      for (const d of defs) {
        const id = createId();
        productIds.push(id);
        await prisma.product.create({
          data: {
            id,
            name: d.name,
            activeSubstances: d.substances,
            formulation: d.formulation,
            defaultUnit: d.unit,
            recommendations: PRODUCT_TAG,
            archived: d.archived ?? false,
            createdById: actor.id,
          },
        });
      }

      const sites = await prisma.site.findMany({
        where: { notes: NOTES_TAG, status: SiteStatus.ACTIVE },
        take: 3,
        orderBy: { name: "asc" },
      });
      for (const [i, site] of sites.entries()) {
        const target = 6 + i * 3;
        for (let n = 1; n <= target; n++) {
          await prisma.monitoringPoint.create({
            data: {
              id: createId(),
              siteId: site.id,
              label: `Точка ${n}`,
              type: n % 2 === 0 ? "POT" : "NEOT",
              active: true,
              createdById: actor.id,
            },
          });
        }
      }

      const visits = await prisma.visit.findMany({
        where: { notes: VISIT_NOTES_TAG, status: VisitStatus.ACTIVE },
        take: 5,
        orderBy: { visitDate: "asc" },
        include: { invoiceLinks: { include: { invoice: true } } },
      });
      for (const [i, visit] of visits.entries()) {
        const p1 = productIds[i % 10]!;
        const p2 = productIds[(i + 1) % 10]!;
        await prisma.visitProduct.create({
          data: {
            id: createId(),
            visitId: visit.id,
            productId: p1,
            quantity: "5.000",
            unit: "ML",
            createdById: actor.id,
          },
        }).catch(() => undefined);
        if (i < 3) {
          await prisma.visitProduct.create({
            data: {
              id: createId(),
              visitId: visit.id,
              productId: p2,
              quantity: "2.000",
              unit: "G",
              createdById: actor.id,
            },
          }).catch(() => undefined);
        }
        const points = await prisma.monitoringPoint.findMany({
          where: { siteId: visit.siteId, active: true },
          take: 3,
        });
        for (const point of points) {
          await prisma.monitoringPointCheck.create({
            data: {
              id: createId(),
              pointId: point.id,
              visitId: visit.id,
              checkedAt: visit.visitDate,
              status: "OK",
              createdById: actor.id,
            },
          }).catch(() => undefined);
        }
      }
      console.log("seeded products, monitoring points, visit products/checks");
    }

    // Task 19: client employees, health certificates, agreements, food sampling.
    const COMPLIANCE_TAG = "__dev_compliance_v1__";
    const complianceExisting = await prisma.clientEmployee.count({
      where: { notes: COMPLIANCE_TAG },
    });
    if (complianceExisting >= 10) {
      console.log(`dev compliance already seeded (${complianceExisting} employees)`);
    } else {
      const actor =
        (await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } })) ??
        (await prisma.user.findFirst({ where: { role: Role.OFFICE, isActive: true } }));
      if (!actor) throw new Error("Need ADMIN/OFFICE for compliance seed");

      const clients = await prisma.client.findMany({
        where: { isActive: true, notes: { not: "__perf_seed_v1__" } },
        take: 4,
        orderBy: { name: "asc" },
      });
      const sites = await prisma.site.findMany({
        where: { notes: NOTES_TAG, status: SiteStatus.ACTIVE },
        take: 8,
        orderBy: { name: "asc" },
      });
      if (clients.length < 4 || sites.length < 4) {
        throw new Error("Need ≥4 clients and sites for compliance seed");
      }

      const asOf = todayInSofia(new Date());
      const jobTitles = ["Управител", "Готвач", "Сервитьор", "Хигиенист", null];
      const employeeIds: string[] = [];
      for (let i = 0; i < 12; i++) {
        const id = createId();
        employeeIds.push(id);
        await prisma.clientEmployee.create({
          data: {
            id,
            clientId: clients[i % 4]!.id,
            fullName: `Dev Служител ${i + 1}`,
            jobTitle: jobTitles[i % jobTitles.length] ?? null,
            siteId: i % 3 === 0 ? null : sites[i % sites.length]!.id,
            notes: COMPLIANCE_TAG,
            createdById: actor.id,
          },
        });
      }

      // 15 certificates: 5 current, 5 expiring (≤30d), 5 expired
      for (let i = 0; i < 15; i++) {
        const empId = employeeIds[i % employeeIds.length]!;
        let last: string;
        let next: string;
        if (i < 5) {
          last = addCalendarMonths(asOf, -6);
          next = addCalendarMonths(asOf, 3);
        } else if (i < 10) {
          const d = new Date(`${asOf}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + (5 + (i - 5) * 4));
          next = d.toISOString().slice(0, 10);
          last = addCalendarMonths(next, -12);
        } else {
          next = addCalendarMonths(asOf, -1);
          last = addCalendarMonths(next, -12);
        }
        if (next <= last) {
          last = addCalendarMonths(next, -6);
        }
        await prisma.healthCertificate.create({
          data: {
            id: createId(),
            clientEmployeeId: empId,
            lastCertifiedAt: new Date(`${last}T00:00:00.000Z`),
            nextRenewalAt: new Date(`${next}T00:00:00.000Z`),
            notes: COMPLIANCE_TAG,
            createdById: actor.id,
          },
        });
      }

      // 8 agreements: 4 active, 2 expired, 1 renewed (+chain), 1 terminated
      const agreementIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = createId();
        agreementIds.push(id);
        const signed = addCalendarMonths(asOf, i < 4 ? -6 : -18);
        const expires =
          i < 4
            ? addCalendarMonths(asOf, 6)
            : addCalendarMonths(asOf, -2);
        await prisma.agreement.create({
          data: {
            id,
            clientId: clients[i % 4]!.id,
            siteId: sites[i % sites.length]!.id,
            serviceType: ServiceType.INSECT_CONTROL,
            signedAt: new Date(`${signed}T00:00:00.000Z`),
            expiresAt: new Date(`${expires}T00:00:00.000Z`),
            contractValue: "1200.00",
            status:
              i < 4
                ? AgreementStatus.ACTIVE
                : AgreementStatus.EXPIRED,
            notes: COMPLIANCE_TAG,
            createdById: actor.id,
          },
        });
      }
      // Renewed chain: old → new
      const prevId = createId();
      const newId = createId();
      const prevSigned = addCalendarMonths(asOf, -24);
      const prevExpires = addCalendarMonths(asOf, -12);
      await prisma.agreement.create({
        data: {
          id: prevId,
          clientId: clients[0]!.id,
          siteId: sites[0]!.id,
          serviceType: ServiceType.RODENT_CONTROL,
          signedAt: new Date(`${prevSigned}T00:00:00.000Z`),
          expiresAt: new Date(`${prevExpires}T00:00:00.000Z`),
          contractValue: "2400.00",
          status: AgreementStatus.RENEWED,
          notes: COMPLIANCE_TAG,
          createdById: actor.id,
        },
      });
      await prisma.agreement.create({
        data: {
          id: newId,
          clientId: clients[0]!.id,
          siteId: sites[0]!.id,
          serviceType: ServiceType.RODENT_CONTROL,
          signedAt: new Date(`${prevExpires}T00:00:00.000Z`),
          expiresAt: new Date(`${addCalendarMonths(prevExpires, 12)}T00:00:00.000Z`),
          contractValue: "2400.00",
          status: AgreementStatus.ACTIVE,
          previousAgreementId: prevId,
          notes: COMPLIANCE_TAG,
          createdById: actor.id,
        },
      });
      await prisma.agreement.create({
        data: {
          id: createId(),
          clientId: clients[1]!.id,
          siteId: sites[1]!.id,
          serviceType: ServiceType.DISINFECTION,
          signedAt: new Date(`${addCalendarMonths(asOf, -3)}T00:00:00.000Z`),
          expiresAt: new Date(`${addCalendarMonths(asOf, 9)}T00:00:00.000Z`),
          contractValue: "800.00",
          status: AgreementStatus.TERMINATED,
          notes: COMPLIANCE_TAG,
          createdById: actor.id,
        },
      });

      // 5 food schedules (3 active, 2 inactive)
      const scheduleIds: string[] = [];
      const cadence = [1, 3, 6, 2, 12];
      for (let i = 0; i < 5; i++) {
        const id = createId();
        scheduleIds.push(id);
        await prisma.foodSamplingSchedule.create({
          data: {
            id,
            siteId: sites[i % sites.length]!.id,
            serviceType:
              i % 2 === 0 ? ServiceType.DISINFECTION : ServiceType.INSECT_CONTROL,
            cadenceMonths: cadence[i]!,
            nextDueAt: new Date(
              `${i < 3 ? asOf : addCalendarMonths(asOf, 2)}T00:00:00.000Z`,
            ),
            active: i < 3,
            notes: COMPLIANCE_TAG,
            createdById: actor.id,
          },
        });
      }

      // 8 food records
      for (let i = 0; i < 8; i++) {
        const status =
          i < 4
            ? FoodResultStatus.PENDING
            : i < 6
              ? FoodResultStatus.CONFORMING
              : FoodResultStatus.NON_CONFORMING;
        await prisma.foodSampleRecord.create({
          data: {
            id: createId(),
            scheduleId: i < 3 ? scheduleIds[i]! : null,
            siteId: sites[i % sites.length]!.id,
            collectedAt: new Date(`${addCalendarMonths(asOf, -1)}T00:00:00.000Z`),
            sampleDescription: `Dev проба ${i + 1}`,
            labName: status === FoodResultStatus.PENDING ? null : "Лаборатория Дев",
            resultReceivedAt:
              status === FoodResultStatus.PENDING
                ? null
                : new Date(`${asOf}T00:00:00.000Z`),
            resultStatus: status,
            resultSummary:
              status === FoodResultStatus.PENDING ? null : "Резултат от seed",
            notes: COMPLIANCE_TAG,
            createdById: actor.id,
          },
        });
      }

      // Erase one employee via full anonymizing UPDATE (mirrors API erase; CHECK-valid).
      const toErase = employeeIds[11]!;
      await prisma.clientEmployee.update({
        where: { id: toErase },
        data: {
          fullName: "[изтрито]",
          jobTitle: "[изтрито]",
          notes: null,
          erasedAt: new Date(),
          erasedById: actor.id,
          eraseReason: "seed GDPR erasure proof",
        },
      });

      console.log("seeded compliance: employees/certs/agreements/food (+1 erased)");
    }

    await seedDevNotifications(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDevNotifications(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: [Role.ADMIN, Role.OFFICE] } },
    orderBy: { email: "asc" },
    take: 2,
  });
  if (users.length < 2) {
    console.log("skip notification seed: need two active ADMIN/OFFICE users");
    return;
  }
  const [first, second] = users;
  const specs = [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `019a0000-0000-7000-8000-000000000d0${i + 1}`,
      userId: first!.id,
      kind: NotificationKind.CERTIFICATE_EXPIRING,
      entityType: "health_certificates",
      thresholdDay: i === 0 ? 7 : 30,
      priority: i === 0 ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
      titleI18nKey: "kinds.CERTIFICATE_EXPIRING.title",
      bodyI18nKey: "kinds.CERTIFICATE_EXPIRING.body",
      bodyParams: { siteName: `Обект ${i + 1}`, expiresAt: "2026-07-15", thresholdDay: i === 0 ? 7 : 30 },
      readAt: null,
      dismissedAt: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `019a0000-0000-7000-8000-000000000d1${i + 1}`,
      userId: first!.id,
      kind: NotificationKind.INVOICE_OVERDUE,
      entityType: "invoices",
      thresholdDay: 0,
      priority: NotificationPriority.HIGH,
      titleI18nKey: "kinds.INVOICE_OVERDUE.title",
      bodyI18nKey: "kinds.INVOICE_OVERDUE.body",
      bodyParams: { invoiceNumber: `DEV-${i + 1}`, dueDate: "2026-06-01", thresholdDay: 0 },
      readAt: new Date("2026-06-01T08:00:00.000Z"),
      dismissedAt: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `019a0000-0000-7000-8000-000000000d2${i + 1}`,
      userId: second!.id,
      kind: NotificationKind.FOOD_SCHEDULE_DUE,
      entityType: "food_sampling_schedules",
      thresholdDay: 0,
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.FOOD_SCHEDULE_DUE.title",
      bodyI18nKey: "kinds.FOOD_SCHEDULE_DUE.body",
      bodyParams: { siteName: `График ${i + 1}`, dueDate: "2026-06-15", thresholdDay: 0 },
      readAt: null,
      dismissedAt: null,
    })),
    {
      id: "019a0000-0000-7000-8000-000000000d31",
      userId: second!.id,
      kind: NotificationKind.AGREEMENT_EXPIRING,
      entityType: "agreements",
      thresholdDay: 14,
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.AGREEMENT_EXPIRING.title",
      bodyI18nKey: "kinds.AGREEMENT_EXPIRING.body",
      bodyParams: { siteName: "Договор", expiresAt: "2026-06-29", thresholdDay: 14 },
      readAt: null,
      dismissedAt: new Date("2026-06-02T08:00:00.000Z"),
    },
  ];
  for (const spec of specs) {
    const existing = await prisma.notification.findUnique({ where: { id: spec.id } });
    if (!existing) {
      await prisma.notification.create({
        data: {
          id: spec.id,
          recipientUserId: spec.userId,
          recipientType: NotificationRecipientType.SYSTEM_USER,
          kind: spec.kind,
          entityType: spec.entityType,
          entityId: spec.id,
          thresholdDay: spec.thresholdDay,
          priority: spec.priority,
          titleI18nKey: spec.titleI18nKey,
          bodyI18nKey: spec.bodyI18nKey,
          bodyParams: spec.bodyParams,
          readAt: spec.readAt,
          dismissedAt: spec.dismissedAt,
        },
      });
    } else {
      await prisma.notification.update({
        where: { id: spec.id },
        data: { readAt: spec.readAt, dismissedAt: spec.dismissedAt },
      });
    }
  }

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    take: 2,
  });
  if (clients[0]) {
    await prisma.client.update({ where: { id: clients[0].id }, data: { notifyByEmail: true } });
  }
  if (clients[1]) {
    await prisma.client.update({ where: { id: clients[1].id }, data: { notifyByEmail: false } });
  }
  const site = await prisma.site.findFirst({ where: { status: SiteStatus.ACTIVE } });
  const actor = first!;
  if (clients[0] && site) {
    const tag = "__dev_notify_v1__";
    const expires = new Date(`${todayInSofia(new Date())}T00:00:00.000Z`);
    expires.setUTCDate(expires.getUTCDate() + 30);
    const signed = new Date(expires);
    signed.setUTCFullYear(signed.getUTCFullYear() - 1);
    const existing = await prisma.agreement.findFirst({ where: { notes: tag } });
    if (!existing) {
      await prisma.agreement.create({
        data: {
          id: createId(),
          clientId: clients[0].id,
          siteId: site.id,
          serviceType: ServiceType.DISINFECTION,
          signedAt: signed,
          expiresAt: expires,
          contractValue: "0.00",
          status: AgreementStatus.ACTIVE,
          notes: tag,
          createdById: actor.id,
        },
      });
    } else {
      await prisma.agreement.update({
        where: { id: existing.id },
        data: { expiresAt: expires, status: AgreementStatus.ACTIVE },
      });
    }
  }
  console.log("seeded dev notifications");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
