/**
 * Task 13 evidence: SQL constraint rejections + audit rows.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task13-evidence.ts
 */
import {
  createId,
  EmployeeRoleOnVisit,
  ServiceType,
  SiteStatus,
  VisitStatus,
} from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  const tag = `__task13_evidence_${Date.now()}__`;
  console.log("=== Task 13 evidence ===\n");

  try {
    const area =
      (await prisma.area.findFirst({ where: { isActive: true } })) ??
      (await prisma.area.create({
        data: { id: createId(), name: `Evidence ${tag}`, isActive: true },
      }));
    const type =
      (await prisma.siteType.findFirst()) ??
      (await prisma.siteType.create({
        data: { id: createId(), name: "Офис", isActive: true },
      }));
    const client =
      (await prisma.client.findFirst({ where: { isActive: true } })) ??
      (await prisma.client.create({
        data: {
          id: createId(),
          kind: "INDIVIDUAL",
          name: `Evidence ${tag}`,
          nameNormalized: "evidence",
          isActive: true,
        },
      }));
    const user =
      (await prisma.user.findFirst({ where: { isActive: true } })) ??
      (() => {
        throw new Error("Need at least one user");
      })();
    const user2 =
      (await prisma.user.findFirst({
        where: { isActive: true, id: { not: user.id } },
      })) ?? user;

    const siteId = createId();
    await prisma.site.create({
      data: {
        id: siteId,
        clientId: client.id,
        areaId: area.id,
        siteTypeId: type.id,
        name: `Evidence site ${tag}`,
        address: "Evidence",
        status: SiteStatus.ACTIVE,
        notes: tag,
      },
    });

    const subId = createId();
    await prisma.subscription.create({
      data: {
        id: subId,
        siteId,
        services: [ServiceType.INSECT_CONTROL],
        frequency: "MONTHLY",
        rate: 50,
        rateIncludesVat: false,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        notes: tag,
      },
    });

    // 1) Future visit_date rejected
    console.log("--- future visit_date CHECK ---");
    try {
      // eslint-disable-next-line no-restricted-syntax -- evidence
      await prisma.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${createId()}'::uuid, '${siteId}'::uuid, '2099-01-01'::date, 'INSECT_CONTROL',
          10, false, 'ACTIVE', '${user.id}'::uuid,
          TIMESTAMPTZ '2026-11-23 12:00:00+00', NOW(), '${createId()}'::uuid
        )
      `);
      console.log("UNEXPECTED: insert succeeded");
    } catch (e) {
      console.log(String(e).slice(0, 400));
    }

    // 2) Unique (created_by, client_mutation_id)
    console.log("\n--- unique (created_by, client_mutation_id) ---");
    const mut = createId();
    const v1 = createId();
    // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
    await prisma.$transaction(async (tx) => {
      await tx.visit.create({
        data: {
          id: v1,
          siteId,
          visitDate: new Date("2026-11-01T00:00:00.000Z"),
          treatmentType: ServiceType.INSECT_CONTROL,
          chargedAmount: 10,
          rateIncludesVat: false,
          status: VisitStatus.ACTIVE,
          createdById: user.id,
          clientMutationId: mut,
          notes: tag,
        },
      });
      await tx.visitEmployee.create({
        data: {
          id: createId(),
          visitId: v1,
          userId: user.id,
          roleOnVisit: EmployeeRoleOnVisit.LEAD,
        },
      });
    });
    try {
      // eslint-disable-next-line no-restricted-syntax -- evidence
      await prisma.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${createId()}'::uuid, '${siteId}'::uuid, '2026-11-02'::date, 'INSECT_CONTROL',
          10, false, 'ACTIVE', '${user.id}'::uuid, NOW(), NOW(), '${mut}'::uuid
        )
      `);
      console.log("UNEXPECTED: duplicate succeeded");
    } catch (e) {
      console.log(String(e).slice(0, 400));
    }

    // 3) Exactly-one-LEAD zero
    console.log("\n--- exactly-one-LEAD (zero LEAD) ---");
    try {
      const vz = createId();
      // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
      await prisma.$transaction(async (tx) => {
        await tx.visit.create({
          data: {
            id: vz,
            siteId,
            visitDate: new Date("2026-11-03T00:00:00.000Z"),
            treatmentType: ServiceType.INSECT_CONTROL,
            chargedAmount: 10,
            rateIncludesVat: false,
            status: VisitStatus.ACTIVE,
            createdById: user.id,
            clientMutationId: createId(),
            notes: tag,
          },
        });
        await tx.visitEmployee.create({
          data: {
            id: createId(),
            visitId: vz,
            userId: user.id,
            roleOnVisit: EmployeeRoleOnVisit.ASSIST,
          },
        });
      });
      console.log("UNEXPECTED: zero LEAD succeeded");
    } catch (e) {
      console.log(String(e).slice(0, 400));
    }

    // 4) Exactly-one-LEAD two
    console.log("\n--- exactly-one-LEAD (two LEAD) ---");
    try {
      const vt = createId();
      // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
      await prisma.$transaction(async (tx) => {
        await tx.visit.create({
          data: {
            id: vt,
            siteId,
            visitDate: new Date("2026-11-04T00:00:00.000Z"),
            treatmentType: ServiceType.INSECT_CONTROL,
            chargedAmount: 10,
            rateIncludesVat: false,
            status: VisitStatus.ACTIVE,
            createdById: user.id,
            clientMutationId: createId(),
            notes: tag,
          },
        });
        await tx.visitEmployee.createMany({
          data: [
            {
              id: createId(),
              visitId: vt,
              userId: user.id,
              roleOnVisit: EmployeeRoleOnVisit.LEAD,
            },
            {
              id: createId(),
              visitId: vt,
              userId: user2.id,
              roleOnVisit: EmployeeRoleOnVisit.LEAD,
            },
          ],
        });
      });
      console.log("UNEXPECTED: two LEAD succeeded");
    } catch (e) {
      console.log(String(e).slice(0, 400));
    }

    // 5) Subscription window
    console.log("\n--- subscription-window trigger ---");
    try {
      const vs = createId();
      // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
      await prisma.$transaction(async (tx) => {
        await tx.visit.create({
          data: {
            id: vs,
            siteId,
            visitDate: new Date("2026-08-01T00:00:00.000Z"),
            treatmentType: ServiceType.INSECT_CONTROL,
            chargedAmount: 10,
            rateIncludesVat: false,
            subscriptionId: subId,
            status: VisitStatus.ACTIVE,
            createdById: user.id,
            clientMutationId: createId(),
            notes: tag,
          },
        });
        await tx.visitEmployee.create({
          data: {
            id: createId(),
            visitId: vs,
            userId: user.id,
            roleOnVisit: EmployeeRoleOnVisit.LEAD,
          },
        });
      });
      console.log("UNEXPECTED: outside window succeeded");
    } catch (e) {
      console.log(String(e).slice(0, 400));
    }

    // 6) Audit rows for a clean create
    console.log("\n--- audit rows (create visit + employee) ---");
    const auditVisit = createId();
    // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
    await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax -- set actor for evidence
      await tx.$executeRawUnsafe(`
        SELECT set_config('app.actor_id', '${user.id}', true),
               set_config('app.actor_label', 'evidence', true),
               set_config('app.source', 'api', true),
               set_config('app.request_id', '${createId()}', true),
               set_config('app.ip', '127.0.0.1', true)
      `);
      await tx.visit.create({
        data: {
          id: auditVisit,
          siteId,
          visitDate: new Date("2026-02-15T00:00:00.000Z"),
          treatmentType: ServiceType.INSECT_CONTROL,
          chargedAmount: 50,
          rateIncludesVat: false,
          subscriptionId: subId,
          status: VisitStatus.ACTIVE,
          createdById: user.id,
          clientMutationId: createId(),
          notes: tag,
        },
      });
      await tx.visitEmployee.create({
        data: {
          id: createId(),
          visitId: auditVisit,
          userId: user.id,
          roleOnVisit: EmployeeRoleOnVisit.LEAD,
        },
      });
      await tx.visit.update({
        where: { id: auditVisit },
        data: { notes: `${tag}-edited` },
      });
      await tx.visit.update({
        where: { id: auditVisit },
        data: {
          status: VisitStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: "evidence cancel",
        },
      });
    });

    const audits = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "visits", entityId: auditVisit },
          { entityType: "visit_employees" },
        ],
        actorUserId: user.id,
      },
      orderBy: { occurredAt: "asc" },
      select: {
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        changedFields: true,
      },
    });
    console.log(JSON.stringify(audits, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
