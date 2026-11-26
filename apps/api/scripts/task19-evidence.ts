/**
 * Task 19 evidence: erasure CHECK, renewal chain, food trigger, READ_PII, export JSON.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task19-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AgreementStatus,
  createId,
  FoodResultStatus,
  ServiceType,
  todayInSofia,
} from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

const OUT = join(process.cwd(), "../../docs/evidence/task-19");

async function sqlStateOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "OK";
  } catch (error) {
    const e = error as {
      meta?: { code?: string; message?: string };
      code?: string;
      message?: string;
    };
    const blob = `${e.meta?.code ?? ""} ${e.meta?.message ?? ""} ${e.code ?? ""} ${e.message ?? ""}`;
    const match = blob.match(/\b(23P0[0-9]|P0001|23514|23505)\b/);
    if (match) return match[1]!;
    if (blob.includes("client_employees_erasure_chk")) return "23514-erasure";
    if (blob.includes("previous_agreement")) return "23505-renewal";
    return e.meta?.code ?? e.code ?? e.message ?? "UNKNOWN";
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  mkdirSync(OUT, { recursive: true });

  const evidence: Record<string, unknown> = {};

  try {
    const user =
      (await prisma.user.findFirst({ where: { role: "ADMIN" } })) ??
      (await prisma.user.findFirst({ where: { role: "OFFICE" } }));
    if (!user) throw new Error("Need ADMIN/OFFICE user");

    const client = await prisma.client.findFirst({ where: { isActive: true } });
    const site = await prisma.site.findFirst({ where: { status: "ACTIVE" } });
    if (!client || !site) throw new Error("Need client + site");

    const empId = createId();
    await prisma.clientEmployee.create({
      data: {
        id: empId,
        clientId: client.id,
        fullName: "Evidence Служител",
        jobTitle: "Готвач",
        siteId: site.id,
        notes: "evidence",
        createdById: user.id,
      },
    });

    evidence.partialErasureNameOnly = await sqlStateOf(() =>
      // eslint-disable-next-line no-restricted-syntax -- CHECK evidence
      prisma.$executeRawUnsafe(
        `UPDATE client_employees SET erased_at = now(), erased_by = $1::uuid, erase_reason = 'достатъчно', full_name = 'Иван' WHERE id = $2::uuid`,
        user.id,
        empId,
      ),
    );
    evidence.partialErasureShortReason = await sqlStateOf(() =>
      // eslint-disable-next-line no-restricted-syntax -- CHECK evidence
      prisma.$executeRawUnsafe(
        `UPDATE client_employees SET erased_at = now(), erased_by = $1::uuid, erase_reason = 'ab', full_name = '[изтрито]', job_title = '[изтрито]' WHERE id = $2::uuid`,
        user.id,
        empId,
      ),
    );

    const exportBefore = {
      fullName: "Evidence Служител",
      jobTitle: "Готвач",
      certificates: [] as unknown[],
    };
    writeFileSync(
      join(OUT, "export-before.json"),
      JSON.stringify(exportBefore, null, 2),
    );

    evidence.fullErasure = await sqlStateOf(() =>
      // eslint-disable-next-line no-restricted-syntax -- CHECK evidence
      prisma.$executeRawUnsafe(
        `UPDATE client_employees SET erased_at = now(), erased_by = $1::uuid, erase_reason = 'GDPR evidence', full_name = '[изтрито]', job_title = '[изтрито]', notes = NULL WHERE id = $2::uuid`,
        user.id,
        empId,
      ),
    );

    const erased = await prisma.clientEmployee.findUnique({ where: { id: empId } });
    writeFileSync(
      join(OUT, "export-after.json"),
      JSON.stringify(
        {
          fullName: erased?.fullName,
          jobTitle: erased?.jobTitle,
          notes: erased?.notes,
          erasedAt: erased?.erasedAt,
        },
        null,
        2,
      ),
    );

    // Renewal chain
    const prevId = createId();
    const nextId = createId();
    const asOf = todayInSofia(new Date());
    await prisma.agreement.create({
      data: {
        id: prevId,
        clientId: client.id,
        siteId: site.id,
        serviceType: ServiceType.INSECT_CONTROL,
        signedAt: new Date("2024-01-01T00:00:00.000Z"),
        expiresAt: new Date("2025-01-01T00:00:00.000Z"),
        contractValue: "1000.00",
        status: AgreementStatus.RENEWED,
        notes: "evidence-chain",
        createdById: user.id,
      },
    });
    await prisma.agreement.create({
      data: {
        id: nextId,
        clientId: client.id,
        siteId: site.id,
        serviceType: ServiceType.INSECT_CONTROL,
        signedAt: new Date("2025-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        contractValue: "1000.00",
        status: AgreementStatus.ACTIVE,
        previousAgreementId: prevId,
        notes: "evidence-chain",
        createdById: user.id,
      },
    });
    evidence.secondRenewalRejected = await sqlStateOf(() =>
      prisma.agreement.create({
        data: {
          id: createId(),
          clientId: client.id,
          siteId: site.id,
          serviceType: ServiceType.INSECT_CONTROL,
          signedAt: new Date("2026-01-01T00:00:00.000Z"),
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
          contractValue: "1000.00",
          status: AgreementStatus.ACTIVE,
          previousAgreementId: prevId,
          notes: "evidence-chain-dup",
          createdById: user.id,
        },
      }),
    );
    evidence.renewalChain = await prisma.agreement.findMany({
      where: { id: { in: [prevId, nextId] } },
      select: { id: true, status: true, previousAgreementId: true, expiresAt: true },
      orderBy: { signedAt: "asc" },
    });

    // Food trigger: pick a site without an active RODENT_CONTROL schedule
    const schedId = createId();
    const dueBefore = asOf;
    const occupied = await prisma.foodSamplingSchedule.findMany({
      where: { serviceType: ServiceType.RODENT_CONTROL, active: true },
      select: { siteId: true },
    });
    const occupiedIds = new Set(occupied.map((s) => s.siteId));
    const foodSite =
      (await prisma.site.findFirst({
        where: { status: "ACTIVE", id: { notIn: [...occupiedIds] } },
      })) ?? site;
    await prisma.foodSamplingSchedule.create({
      data: {
        id: schedId,
        siteId: foodSite.id,
        serviceType: ServiceType.RODENT_CONTROL,
        cadenceMonths: 3,
        nextDueAt: new Date(`${dueBefore}T00:00:00.000Z`),
        active: true,
        notes: "evidence-food",
        createdById: user.id,
      },
    });
    await prisma.foodSampleRecord.create({
      data: {
        id: createId(),
        scheduleId: schedId,
        siteId: foodSite.id,
        collectedAt: new Date(`${dueBefore}T00:00:00.000Z`),
        sampleDescription: "Evidence sample",
        resultStatus: FoodResultStatus.PENDING,
        notes: "evidence-food",
        createdById: user.id,
      },
    });
    const schedAfter = await prisma.foodSamplingSchedule.findUnique({
      where: { id: schedId },
    });
    evidence.foodTrigger = {
      before: dueBefore,
      after: schedAfter?.nextDueAt,
      cadenceMonths: 3,
    };

    // READ_PII sample rows (if any already exist from tests)
    const readPii = await prisma.auditLog.findMany({
      where: { action: "READ_PII" },
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        occurredAt: true,
        meta: true,
      },
    });
    evidence.readPiiSamples = readPii;

    writeFileSync(join(OUT, "sql-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
