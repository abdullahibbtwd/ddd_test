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
  addCalendarMonths,
  AgreementStatus,
  buildLineAmounts,
  createId,
  CURRENCY,
  DocumentType,
  EmployeeRoleOnVisit,
  formatInvoiceNumber,
  InvoiceStatus,
  NotificationKind,
  NotificationPriority,
  NotificationRecipientType,
  Role,
  ServiceType,
  SubscriptionFrequency,
  todayInSofia,
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

    // Two issued invoices 0000000001 / 0000000002 (idempotent). Dedicated visits
    // so Playwright can still pick un-invoiced ACTIVE visits for create+issue.
    const E2E_INV_TAG = "__e2e_invoices_v1__";
    const e2eInvCount = await prisma.invoice.count({ where: { notes: E2E_INV_TAG } });
    if (e2eInvCount === 0) {
      const office = await prisma.user.findUnique({ where: { email: "office@e2e.local" } });
      const client = await prisma.client.findFirst({ orderBy: { name: "asc" } });
      const areaA = areaIdByKey.get("A");
      const siteType = await prisma.siteType.findFirst();
      if (office && client && areaA && siteType) {
        const siteId = createId();
        await prisma.site.create({
          data: {
            id: siteId,
            clientId: client.id,
            areaId: areaA,
            siteTypeId: siteType.id,
            name: "E2E Фактура Обект",
            address: "ул. Фактура 1, София",
            notes: E2E_INV_TAG,
          },
        });

        async function makeVisit(day: string): Promise<string> {
          const visitId = createId();
          // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx
          await prisma.$transaction(async (tx) => {
            await tx.visit.create({
              data: {
                id: visitId,
                siteId,
                visitDate: new Date(`${day}T00:00:00.000Z`),
                treatmentType: ServiceType.INSECT_CONTROL,
                chargedAmount: 80,
                rateIncludesVat: true,
                notes: E2E_INV_TAG,
                status: VisitStatus.ACTIVE,
                createdById: office!.id,
                clientMutationId: createId(),
              },
            });
            await tx.visitEmployee.create({
              data: {
                id: createId(),
                visitId,
                userId: office!.id,
                roleOnVisit: EmployeeRoleOnVisit.LEAD,
              },
            });
          });
          return visitId;
        }

        const visit1 = await makeVisit("2026-09-01");
        const visit2 = await makeVisit("2026-09-02");

        const line = {
          description: "E2E фактурирана услуга",
          quantity: "1.000",
          unitPrice: "80.00",
          vatRate: "20.00",
        };
        const amounts = buildLineAmounts(line);

        for (const [n, visitId] of [
          [1, visit1],
          [2, visit2],
        ] as const) {
          const number = formatInvoiceNumber(n);
          const existingNumber = await prisma.invoice.findUnique({ where: { number } });
          if (existingNumber) {
            console.log(`skip e2e invoice ${number} (number taken)`);
            continue;
          }
          const invoiceId = createId();
          await prisma.invoice.create({
            data: {
              id: invoiceId,
              number,
              status: InvoiceStatus.ISSUED,
              documentType: DocumentType.INVOICE,
              clientId: client.id,
              issuedAt: new Date(),
              issuedById: office.id,
              clientLegalName: client.name,
              clientEik: client.eik ?? "",
              clientVatNumber: client.vatNumber ?? "",
              clientRegisteredAddress: client.registeredAddress ?? "",
              clientLegalRepresentative: client.legalRepresentative ?? "",
              clientEmail: client.email,
              clientPhone: client.phone,
              currency: CURRENCY,
              netAmount: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
              grossAmount: (Number(amounts.lineTotal) + Number(amounts.vatAmount)).toFixed(2),
              notes: E2E_INV_TAG,
              billingMonth: new Date("2026-09-01T00:00:00.000Z"),
              createdById: office.id,
            },
          });
          await prisma.invoiceLine.create({
            data: {
              id: createId(),
              invoiceId,
              lineNo: 1,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              lineTotal: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
            },
          });
          await prisma.invoiceVisit.create({
            data: { id: createId(), invoiceId, visitId },
          });
        }

        const counter = await prisma.invoiceCounter.findUniqueOrThrow({
          where: { id: "default" },
        });
        if (counter.nextValue < 3) {
          await prisma.invoiceCounter.update({
            where: { id: "default" },
            data: { nextValue: 3 },
          });
        }
        console.log("seeded e2e invoices 0000000001–0000000002");
      } else {
        console.log("skip e2e invoices (need office/client/area/type)");
      }
    }

    // Task 16: deterministic invoice 0000000100 left ISSUED so Playwright can
    // issue credit note 0000000101. Reset between suite runs (test DB only).
    const E2E_DOC_TAG = "__e2e_invoice_docs_v1__";
    const number100 = formatInvoiceNumber(100);
    const office = await prisma.user.findUnique({ where: { email: "office@e2e.local" } });
    const client = await prisma.client.findFirst({ orderBy: { name: "asc" } });
    if (office && client) {
      const amounts = buildLineAmounts({
        description: "E2E документна услуга",
        quantity: "1.000",
        unitPrice: "100.00",
        vatRate: "20.00",
      });
      // eslint-disable-next-line no-restricted-syntax -- e2e reset of immutable docs
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS trg_invoices_reject_issued_mutation ON invoices;
        DROP TRIGGER IF EXISTS trg_invoice_lines_reject_issued_mutation ON invoice_lines;
        DROP TRIGGER IF EXISTS trg_invoices_after_insert_credit_note ON invoices;
        DROP TRIGGER IF EXISTS trg_payments_guard ON payments;
        DROP TRIGGER IF EXISTS trg_cash_handovers_reject_mutation ON cash_handovers;
      `);
      try {
        // Wipe numbers >= 101 so counter can return to 101 without unique collisions
        // (e2e-only; keeps 0000000100/0101 deterministic across Playwright ×3).
        // eslint-disable-next-line no-restricted-syntax -- e2e wipe high numbers
        await prisma.$executeRawUnsafe(`
          DELETE FROM email_events
          WHERE invoice_id IN (
            SELECT id FROM invoices WHERE number IS NOT NULL AND number::bigint >= 101
          );
          DELETE FROM payments
          WHERE invoice_id IN (
            SELECT id FROM invoices WHERE number IS NOT NULL AND number::bigint >= 101
          );
          DELETE FROM invoice_visit
          WHERE invoice_id IN (
            SELECT id FROM invoices WHERE number IS NOT NULL AND number::bigint >= 101
          );
          DELETE FROM invoice_lines
          WHERE invoice_id IN (
            SELECT id FROM invoices WHERE number IS NOT NULL AND number::bigint >= 101
          );
          DELETE FROM invoices WHERE number IS NOT NULL AND number::bigint >= 101;
        `);
        let original = await prisma.invoice.findUnique({ where: { number: number100 } });
        if (original) {
          // eslint-disable-next-line no-restricted-syntax -- e2e status reset
          await prisma.$executeRawUnsafe(`
            DELETE FROM email_events WHERE invoice_id = '${original.id}'::uuid;
            UPDATE invoices
            SET status = 'ISSUED',
                email_sent_at = NULL,
                email_last_error = NULL,
                due_date = COALESCE(due_date, (issued_at AT TIME ZONE 'Europe/Sofia')::date + 30),
                updated_at = NOW()
            WHERE id = '${original.id}'::uuid
          `);
        } else {
          const originalId = createId();
          await prisma.invoice.create({
            data: {
              id: originalId,
              number: number100,
              status: InvoiceStatus.ISSUED,
              documentType: DocumentType.INVOICE,
              clientId: client.id,
              issuedAt: new Date("2026-10-01T10:00:00.000Z"),
              issuedById: office.id,
              clientLegalName: client.name,
              clientEik: client.eik ?? "",
              clientVatNumber: client.vatNumber ?? "",
              clientRegisteredAddress: client.registeredAddress ?? "",
              clientLegalRepresentative: client.legalRepresentative ?? "",
              clientEmail: client.email ?? "office@e2e.local",
              clientPhone: client.phone,
              currency: CURRENCY,
              netAmount: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
              grossAmount: (Number(amounts.lineTotal) + Number(amounts.vatAmount)).toFixed(2),
              notes: E2E_DOC_TAG,
              billingMonth: new Date("2026-10-01T00:00:00.000Z"),
              dueDate: new Date("2026-10-31T00:00:00.000Z"),
              createdById: office.id,
            },
          });
          await prisma.invoiceLine.create({
            data: {
              id: createId(),
              invoiceId: originalId,
              lineNo: 1,
              description: "E2E документна услуга",
              quantity: "1.000",
              unitPrice: "100.00",
              vatRate: "20.00",
              lineTotal: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
            },
          });
          original = await prisma.invoice.findUniqueOrThrow({ where: { id: originalId } });
        }
        await prisma.invoiceCounter.update({
          where: { id: "default" },
          data: { nextValue: 101 },
        });
        console.log("seeded/reset e2e invoice doc 0000000100 (credit 0000000101 reserved)");

        // Task 17: deterministic payment invoices 0000009000/9001/9002
        // (high band so Task 16 credit 0101 + sequential allocate never collide with 0200)
        async function upsertPayInvoice(
          n: number,
          opts: { dueDate: string; paidAmount?: string; clientEmail?: string | null },
        ) {
          const number = formatInvoiceNumber(n);
          const existing = await prisma.invoice.findUnique({ where: { number } });
          const gross = (
            Number(amounts.lineTotal) + Number(amounts.vatAmount)
          ).toFixed(2);
          let invId = existing?.id;
          if (!existing) {
            invId = createId();
            await prisma.invoice.create({
              data: {
                id: invId,
                number,
                status: InvoiceStatus.ISSUED,
                documentType: DocumentType.INVOICE,
                clientId: client.id,
                issuedAt: new Date("2026-09-01T10:00:00.000Z"),
                issuedById: office.id,
                clientLegalName: client.name,
                clientEik: client.eik ?? "",
                clientVatNumber: client.vatNumber ?? "",
                clientRegisteredAddress: client.registeredAddress ?? "",
                clientLegalRepresentative: client.legalRepresentative ?? "",
                clientEmail:
                  opts.clientEmail === null
                    ? null
                    : (opts.clientEmail ?? client.email ?? "office@e2e.local"),
                clientPhone: client.phone,
                currency: CURRENCY,
                netAmount: amounts.lineTotal,
                vatAmount: amounts.vatAmount,
                grossAmount: gross,
                notes: "__e2e_payments_v1__",
                billingMonth: new Date("2026-09-01T00:00:00.000Z"),
                dueDate: new Date(`${opts.dueDate}T00:00:00.000Z`),
                createdById: office.id,
              },
            });
            await prisma.invoiceLine.create({
              data: {
                id: createId(),
                invoiceId: invId!,
                lineNo: 1,
                description: "E2E плащане",
                quantity: "1.000",
                unitPrice: "100.00",
                vatRate: "20.00",
                lineTotal: amounts.lineTotal,
                vatAmount: amounts.vatAmount,
              },
            });
          } else {
            // eslint-disable-next-line no-restricted-syntax -- e2e reset payments
            await prisma.$executeRawUnsafe(`
              DELETE FROM payments WHERE invoice_id = '${existing.id}'::uuid;
              UPDATE invoices SET due_date = DATE '${opts.dueDate}'
              WHERE id = '${existing.id}'::uuid;
            `);
          }
          if (opts.paidAmount && invId) {
            await prisma.payment.create({
              data: {
                id: createId(),
                invoiceId: invId,
                amount: opts.paidAmount,
                method: "BANK_TRANSFER",
                paidAt: new Date("2026-09-15T00:00:00.000Z"),
                createdById: office.id,
              },
            });
          }
        }
        await upsertPayInvoice(9000, { dueDate: "2026-12-31", paidAmount: "40.00" });
        await upsertPayInvoice(9001, { dueDate: "2020-01-01" }); // overdue unpaid
        await upsertPayInvoice(9002, { dueDate: "2026-12-31", paidAmount: "120.00" }); // fully paid
        const counter = await prisma.invoiceCounter.findUniqueOrThrow({
          where: { id: "default" },
        });
        if (counter.nextValue < 9003) {
          await prisma.invoiceCounter.update({
            where: { id: "default" },
            data: { nextValue: 9003 },
          });
        }
        console.log("seeded/reset e2e payment invoices 0000009000–0000009002");
      } finally {
        // eslint-disable-next-line no-restricted-syntax -- restore immutability triggers
        await prisma.$executeRawUnsafe(`
          DROP TRIGGER IF EXISTS trg_invoices_reject_issued_mutation ON invoices;
          CREATE TRIGGER trg_invoices_reject_issued_mutation
          BEFORE UPDATE OR DELETE ON invoices
          FOR EACH ROW
          EXECUTE FUNCTION invoices_reject_issued_mutation();
          DROP TRIGGER IF EXISTS trg_invoice_lines_reject_issued_mutation ON invoice_lines;
          CREATE TRIGGER trg_invoice_lines_reject_issued_mutation
          BEFORE UPDATE OR DELETE ON invoice_lines
          FOR EACH ROW
          EXECUTE FUNCTION invoice_lines_reject_issued_mutation();
          DROP TRIGGER IF EXISTS trg_invoices_after_insert_credit_note ON invoices;
          CREATE TRIGGER trg_invoices_after_insert_credit_note
          AFTER INSERT ON invoices
          FOR EACH ROW
          EXECUTE FUNCTION invoices_after_insert_credit_note();
          DROP TRIGGER IF EXISTS trg_payments_guard ON payments;
          CREATE TRIGGER trg_payments_guard
          BEFORE INSERT OR UPDATE OR DELETE ON payments
          FOR EACH ROW
          EXECUTE FUNCTION payments_guard();
          DROP TRIGGER IF EXISTS trg_cash_handovers_reject_mutation ON cash_handovers;
          CREATE TRIGGER trg_cash_handovers_reject_mutation
          BEFORE UPDATE OR DELETE ON cash_handovers
          FOR EACH ROW
          EXECUTE FUNCTION cash_handovers_reject_mutation();
        `);
      }
    }

    // Task 18 e2e: product + visit with 2 products; site with 4 points; frozen visit.
    // Idempotent: create missing rows, then always ensure the frozen visit has an ISSUED invoice link.
    // Reuses `office` / `client` from the Task 16–17 seed block above.
    const E2E_P18_TAG = "__e2e_products_v1__";
    const fieldP18 = await prisma.user.findUnique({ where: { email: "field@e2e.local" } });
    const areaAP18 = areaIdByKey.get("A");
    const siteTypeP18 = await prisma.siteType.findFirst();
    if (office && fieldP18 && areaAP18 && siteTypeP18 && client) {
      let p1 = await prisma.product.findFirst({ where: { name: "E2E Препарат Alpha" } });
      let p2 = await prisma.product.findFirst({ where: { name: "E2E Препарат Beta" } });
      if (!p1) {
        p1 = await prisma.product.create({
          data: {
            id: createId(),
            name: "E2E Препарат Alpha",
            activeSubstances: ["α-e2e"],
            formulation: "LIQUID",
            defaultUnit: "ML",
            recommendations: E2E_P18_TAG,
            createdById: office.id,
          },
        });
      }
      if (!p2) {
        p2 = await prisma.product.create({
          data: {
            id: createId(),
            name: "E2E Препарат Beta",
            activeSubstances: ["β-e2e"],
            formulation: "GEL",
            defaultUnit: "G",
            recommendations: E2E_P18_TAG,
            createdById: office.id,
          },
        });
      }

      let site = await prisma.site.findFirst({ where: { notes: E2E_P18_TAG } });
      if (!site) {
        site = await prisma.site.create({
          data: {
            id: createId(),
            clientId: client.id,
            areaId: areaAP18,
            siteTypeId: siteTypeP18.id,
            name: "E2E Мониторинг Обект",
            address: "ул. Точки 4, София",
            notes: E2E_P18_TAG,
            monitoringPointsCount: 0,
          },
        });
        for (let n = 1; n <= 4; n++) {
          await prisma.monitoringPoint.create({
            data: {
              id: createId(),
              siteId: site.id,
              label: `Точка ${n}`,
              type: n % 2 === 0 ? "POT" : "NEOT",
              active: true,
              createdById: office.id,
            },
          });
        }
      }

      let openVisit = await prisma.visit.findFirst({ where: { notes: E2E_P18_TAG } });
      if (!openVisit) {
        const openVisitId = createId();
        // eslint-disable-next-line no-restricted-syntax -- visit+employees
        await prisma.$transaction(async (tx) => {
          await tx.visit.create({
            data: {
              id: openVisitId,
              siteId: site!.id,
              visitDate: new Date("2026-11-10T00:00:00.000Z"),
              treatmentType: ServiceType.INSECT_CONTROL,
              chargedAmount: 55,
              rateIncludesVat: false,
              notes: E2E_P18_TAG,
              status: VisitStatus.ACTIVE,
              createdById: fieldP18.id,
              clientMutationId: createId(),
            },
          });
          await tx.visitEmployee.create({
            data: {
              id: createId(),
              visitId: openVisitId,
              userId: fieldP18.id,
              roleOnVisit: EmployeeRoleOnVisit.LEAD,
            },
          });
        });
        await prisma.visitProduct.create({
          data: {
            id: createId(),
            visitId: openVisitId,
            productId: p1.id,
            quantity: "3.000",
            unit: "ML",
            createdById: fieldP18.id,
          },
        });
        await prisma.visitProduct.create({
          data: {
            id: createId(),
            visitId: openVisitId,
            productId: p2.id,
            quantity: "1.500",
            unit: "G",
            createdById: fieldP18.id,
          },
        });
        openVisit = await prisma.visit.findUniqueOrThrow({ where: { id: openVisitId } });
      }

      let frozenVisit = await prisma.visit.findFirst({
        where: { notes: `${E2E_P18_TAG}_frozen` },
      });
      if (!frozenVisit) {
        const frozenVisitId = createId();
        // eslint-disable-next-line no-restricted-syntax -- visit+employees
        await prisma.$transaction(async (tx) => {
          await tx.visit.create({
            data: {
              id: frozenVisitId,
              siteId: site!.id,
              visitDate: new Date("2026-11-05T00:00:00.000Z"),
              treatmentType: ServiceType.RODENT_CONTROL,
              chargedAmount: 70,
              rateIncludesVat: false,
              notes: `${E2E_P18_TAG}_frozen`,
              status: VisitStatus.ACTIVE,
              createdById: fieldP18.id,
              clientMutationId: createId(),
            },
          });
          await tx.visitEmployee.create({
            data: {
              id: createId(),
              visitId: frozenVisitId,
              userId: fieldP18.id,
              roleOnVisit: EmployeeRoleOnVisit.LEAD,
            },
          });
        });
        await prisma.visitProduct.create({
          data: {
            id: createId(),
            visitId: frozenVisitId,
            productId: p1.id,
            quantity: "2.000",
            unit: "ML",
            createdById: fieldP18.id,
          },
        });
        frozenVisit = await prisma.visit.findUniqueOrThrow({ where: { id: frozenVisitId } });
      }

      // One statement per executeRawUnsafe — Prisma/pg only runs the first statement otherwise.
      const existingIssued = await prisma.invoiceVisit.findFirst({
        where: {
          visitId: frozenVisit.id,
          invoice: { status: "ISSUED" },
        },
      });
      if (!existingIssued) {
        const invId = createId();
        const legalName = client.name.replace(/'/g, "''");
        const eik = (client.eik ?? "").replace(/'/g, "''");
        // eslint-disable-next-line no-restricted-syntax -- draft + issue for freeze seed
        await prisma.$executeRawUnsafe(`
          INSERT INTO invoices (
            id, number, status, document_type, client_id,
            currency, net_amount, vat_amount, gross_amount, billing_month,
            notes, created_by, created_at, updated_at
          ) VALUES (
            '${invId}'::uuid, NULL, 'DRAFT', 'INVOICE', '${client.id}'::uuid,
            'EUR', 0, 0, 0, DATE '2026-11-01',
            '${E2E_P18_TAG}', '${office.id}'::uuid, NOW(), NOW()
          )`);
        // eslint-disable-next-line no-restricted-syntax -- link visit
        await prisma.$executeRawUnsafe(`
          INSERT INTO invoice_visit (id, invoice_id, visit_id)
          VALUES ('${createId()}'::uuid, '${invId}'::uuid, '${frozenVisit.id}'::uuid)
          ON CONFLICT DO NOTHING`);
        // eslint-disable-next-line no-restricted-syntax -- issue (writes visit_products_snapshot)
        await prisma.$executeRawUnsafe(`
          UPDATE invoices SET
            status = 'ISSUED',
            number = '0000000099',
            issued_at = NOW(),
            issued_by = '${office.id}'::uuid,
            client_legal_name = '${legalName}',
            client_eik = '${eik}',
            client_vat_number = '',
            client_registered_address = 'E2E',
            client_legal_representative = 'E2E',
            net_amount = 70.00,
            vat_amount = 14.00,
            gross_amount = 84.00,
            due_date = (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
            updated_at = NOW()
          WHERE id = '${invId}'::uuid`);
        console.log("seeded/repaired e2e products frozen invoice 0000000099");
      } else {
        console.log("e2e products / monitoring / frozen visit already linked");
      }

      // Task 16 e2e expects credit-note 0000000101 for invoice 0100. Payment seed
      // bumps the counter for 9000–9002; pin it back to 101 after Task 18.
      // Frozen visit uses explicit number 0000000099 (below the 0100/0101 band).
      // Payment fixtures live at 9000+ so batch/issue allocate (102…) never hits them.
      await prisma.invoiceCounter.update({
        where: { id: "default" },
        data: { nextValue: 101 },
      });
    }

    // Task 19 e2e: client with 2 employees, certs, agreement, food schedule.
    const E2E_P19_TAG = "__e2e_compliance_v1__";
    const officeP19 = await prisma.user.findUnique({ where: { email: "office@e2e.local" } });
    const areaAP19 = areaIdByKey.get("A");
    const siteTypeP19 = await prisma.siteType.findFirst();
    const clientP19 =
      (await prisma.client.findFirst({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }));
    if (officeP19 && areaAP19 && siteTypeP19 && clientP19) {
      let siteP19 = await prisma.site.findFirst({ where: { notes: E2E_P19_TAG } });
      if (!siteP19) {
        siteP19 = await prisma.site.create({
          data: {
            id: createId(),
            clientId: clientP19.id,
            areaId: areaAP19,
            siteTypeId: siteTypeP19.id,
            name: "E2E Сертификати Обект",
            address: "ул. GDPR 19, София",
            notes: E2E_P19_TAG,
            monitoringPointsCount: 0,
          },
        });
      }

      const asOf = todayInSofia(new Date());
      let emp1 = await prisma.clientEmployee.findFirst({
        where: { fullName: "E2E Служител Актуален", notes: E2E_P19_TAG },
      });
      if (!emp1) {
        emp1 = await prisma.clientEmployee.create({
          data: {
            id: createId(),
            clientId: clientP19.id,
            fullName: "E2E Служител Актуален",
            jobTitle: "Управител",
            siteId: siteP19.id,
            notes: E2E_P19_TAG,
            createdById: officeP19.id,
          },
        });
      }
      let emp2 = await prisma.clientEmployee.findFirst({
        where: { fullName: "E2E Служител Изтекъл", notes: E2E_P19_TAG },
      });
      if (!emp2) {
        emp2 = await prisma.clientEmployee.create({
          data: {
            id: createId(),
            clientId: clientP19.id,
            fullName: "E2E Служител Изтекъл",
            jobTitle: "Готвач",
            siteId: siteP19.id,
            notes: E2E_P19_TAG,
            createdById: officeP19.id,
          },
        });
      }

      const expiringIn10 = (() => {
        const d = new Date(`${asOf}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 10);
        return d.toISOString().slice(0, 10);
      })();
      const expiredAt = addCalendarMonths(asOf, -1);

      const certExpiring = await prisma.healthCertificate.findFirst({
        where: { clientEmployeeId: emp1.id, notes: E2E_P19_TAG },
      });
      if (!certExpiring) {
        await prisma.healthCertificate.create({
          data: {
            id: createId(),
            clientEmployeeId: emp1.id,
            lastCertifiedAt: new Date(
              `${addCalendarMonths(expiringIn10, -12)}T00:00:00.000Z`,
            ),
            nextRenewalAt: new Date(`${expiringIn10}T00:00:00.000Z`),
            notes: E2E_P19_TAG,
            createdById: officeP19.id,
          },
        });
      }
      const certExpired = await prisma.healthCertificate.findFirst({
        where: { clientEmployeeId: emp2.id, notes: E2E_P19_TAG },
      });
      if (!certExpired) {
        await prisma.healthCertificate.create({
          data: {
            id: createId(),
            clientEmployeeId: emp2.id,
            lastCertifiedAt: new Date(
              `${addCalendarMonths(expiredAt, -12)}T00:00:00.000Z`,
            ),
            nextRenewalAt: new Date(`${expiredAt}T00:00:00.000Z`),
            notes: E2E_P19_TAG,
            createdById: officeP19.id,
          },
        });
      }

      const agreeExpires = (() => {
        const d = new Date(`${asOf}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 5);
        return d.toISOString().slice(0, 10);
      })();
      const existingAgree = await prisma.agreement.findFirst({
        where: { notes: E2E_P19_TAG, status: AgreementStatus.ACTIVE },
      });
      if (!existingAgree) {
        await prisma.agreement.create({
          data: {
            id: createId(),
            clientId: clientP19.id,
            siteId: siteP19.id,
            serviceType: ServiceType.INSECT_CONTROL,
            signedAt: new Date(`${addCalendarMonths(agreeExpires, -12)}T00:00:00.000Z`),
            expiresAt: new Date(`${agreeExpires}T00:00:00.000Z`),
            contractValue: "1500.00",
            status: AgreementStatus.ACTIVE,
            notes: E2E_P19_TAG,
            createdById: officeP19.id,
          },
        });
      }

      const existingSched = await prisma.foodSamplingSchedule.findFirst({
        where: { notes: E2E_P19_TAG, active: true },
      });
      if (!existingSched) {
        await prisma.foodSamplingSchedule.create({
          data: {
            id: createId(),
            siteId: siteP19.id,
            serviceType: ServiceType.DISINFECTION,
            cadenceMonths: 3,
            nextDueAt: new Date(`${asOf}T00:00:00.000Z`),
            active: true,
            notes: E2E_P19_TAG,
            createdById: officeP19.id,
          },
        });
      }
      console.log("seeded e2e compliance (Task 19)");
    }

    await seedE2eNotifications(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedE2eNotifications(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { email: "admin@e2e.local" } });
  const office = await prisma.user.findUnique({ where: { email: "office@e2e.local" } });
  const field = await prisma.user.findUnique({ where: { email: "field@e2e.local" } });
  if (!admin || !office || !field) return;

  const invoice = await prisma.invoice.findFirst({
    where: { status: InvoiceStatus.ISSUED },
    orderBy: { createdAt: "asc" },
  });
  const asOf = todayInSofia(new Date());
  const expires = new Date(`${asOf}T00:00:00.000Z`);
  expires.setUTCDate(expires.getUTCDate() + 30);

  const rows = [
    {
      id: "019a0000-0000-7000-8000-0000000000a1",
      userId: admin.id,
      kind: NotificationKind.CERTIFICATE_EXPIRING,
      entityType: "health_certificates",
      entityId: "019a0000-0000-7000-8000-0000000000a1",
      thresholdDay: 7,
      priority: NotificationPriority.HIGH,
      titleI18nKey: "kinds.CERTIFICATE_EXPIRING.title",
      bodyI18nKey: "kinds.CERTIFICATE_EXPIRING.body",
      bodyParams: { siteName: "E2E-N-CERT", expiresAt: expires.toISOString().slice(0, 10), thresholdDay: 7 },
      readAt: null as Date | null,
      dismissedAt: null as Date | null,
    },
    {
      id: "019a0000-0000-7000-8000-0000000000a2",
      userId: admin.id,
      kind: NotificationKind.INVOICE_OVERDUE,
      entityType: "invoices",
      entityId: invoice?.id ?? "019a0000-0000-7000-8000-0000000000a2",
      thresholdDay: 0,
      priority: NotificationPriority.HIGH,
      titleI18nKey: "kinds.INVOICE_OVERDUE.title",
      bodyI18nKey: "kinds.INVOICE_OVERDUE.body",
      bodyParams: { invoiceNumber: "E2E-N-INV", dueDate: asOf, thresholdDay: 0 },
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "019a0000-0000-7000-8000-0000000000b1",
      userId: office.id,
      kind: NotificationKind.FOOD_SCHEDULE_DUE,
      entityType: "food_sampling_schedules",
      entityId: "019a0000-0000-7000-8000-0000000000b1",
      thresholdDay: 0,
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.FOOD_SCHEDULE_DUE.title",
      bodyI18nKey: "kinds.FOOD_SCHEDULE_DUE.body",
      bodyParams: { siteName: "E2E-N-FOOD", dueDate: asOf, thresholdDay: 0 },
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "019a0000-0000-7000-8000-0000000000b2",
      userId: office.id,
      kind: NotificationKind.AGREEMENT_EXPIRING,
      entityType: "agreements",
      entityId: "019a0000-0000-7000-8000-0000000000b2",
      thresholdDay: 14,
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.AGREEMENT_EXPIRING.title",
      bodyI18nKey: "kinds.AGREEMENT_EXPIRING.body",
      bodyParams: { siteName: "E2E-N-AGR", expiresAt: expires.toISOString().slice(0, 10), thresholdDay: 14 },
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "019a0000-0000-7000-8000-0000000000c1",
      userId: field.id,
      kind: NotificationKind.CERTIFICATE_EXPIRING,
      entityType: "health_certificates",
      entityId: "019a0000-0000-7000-8000-0000000000c1",
      thresholdDay: 30,
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.CERTIFICATE_EXPIRING.title",
      bodyI18nKey: "kinds.CERTIFICATE_EXPIRING.body",
      bodyParams: { siteName: "E2E-N-FIELD", expiresAt: expires.toISOString().slice(0, 10), thresholdDay: 30 },
      readAt: null,
      dismissedAt: null,
    },
  ];

  for (const spec of rows) {
    const existing = await prisma.notification.findUnique({ where: { id: spec.id } });
    if (!existing) {
      await prisma.notification.create({
        data: {
          id: spec.id,
          recipientUserId: spec.userId,
          recipientType: NotificationRecipientType.SYSTEM_USER,
          kind: spec.kind,
          entityType: spec.entityType,
          entityId: spec.entityId,
          thresholdDay: spec.thresholdDay,
          priority: spec.priority,
          titleI18nKey: spec.titleI18nKey,
          bodyI18nKey: spec.bodyI18nKey,
          bodyParams: spec.bodyParams,
        },
      });
    } else {
      await prisma.notification.update({
        where: { id: spec.id },
        data: { readAt: null, dismissedAt: null },
      });
    }
  }

  const site = await prisma.site.findFirst({ where: { notes: "__e2e_compliance_v1__" } });
  if (site && office) {
    const signed = new Date(expires);
    signed.setUTCFullYear(signed.getUTCFullYear() - 1);
    for (const spec of [
      {
        email: "e2e-notify-yes@e2e.local",
        name: "E2E Notify Yes",
        notify: true,
        tag: "__e2e_notify_yes__",
        eik: "990000001",
      },
      {
        email: "e2e-notify-no@e2e.local",
        name: "E2E Notify No",
        notify: false,
        tag: "__e2e_notify_no__",
        eik: "990000002",
      },
    ]) {
      let client = await prisma.client.findFirst({ where: { email: spec.email } });
      if (!client) {
        client = await prisma.client.create({
          data: {
            id: createId(),
            kind: "COMPANY",
            name: spec.name,
            nameNormalized: spec.name.toLowerCase(),
            email: spec.email,
            eik: spec.eik,
            notifyByEmail: spec.notify,
            isActive: true,
          },
        });
      } else {
        await prisma.client.update({
          where: { id: client.id },
          data: { notifyByEmail: spec.notify, email: spec.email },
        });
      }
      const agreement = await prisma.agreement.findFirst({ where: { notes: spec.tag } });
      if (!agreement) {
        await prisma.agreement.create({
          data: {
            id: createId(),
            clientId: client.id,
            siteId: site.id,
            serviceType: ServiceType.DISINFECTION,
            signedAt: signed,
            expiresAt: expires,
            contractValue: "0.00",
            status: AgreementStatus.ACTIVE,
            notes: spec.tag,
            createdById: office.id,
          },
        });
      } else {
        await prisma.agreement.update({
          where: { id: agreement.id },
          data: { expiresAt: expires, status: AgreementStatus.ACTIVE },
        });
      }
    }
  }
  console.log("seeded e2e notifications");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
