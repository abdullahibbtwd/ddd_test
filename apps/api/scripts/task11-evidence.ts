/**
 * Quick-add audit evidence for Task 11.
 *   pnpm --filter @ddcrm/api exec tsx scripts/task11-evidence.ts
 */
import { ClientKind, createId, SiteStatus } from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runWithActorContextAsync } from "../src/audit/actor-context";
import { hashPassword } from "../src/auth/password";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { createAppPrisma } from "../src/prisma/create-prisma";
import { PrismaClient, Role } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const raw = new PrismaClient({ adapter });
  const prisma = createAppPrisma(env.DATABASE_URL);

  const area =
    (await raw.area.findFirst({ where: { isActive: true } })) ??
    (await raw.area.create({
      data: { id: createId(), name: "Evidence Area", isActive: true },
    }));
  const type =
    (await raw.siteType.findFirst({ where: { isActive: true } })) ??
    (await raw.siteType.create({
      data: { id: createId(), name: "Evidence Type", isActive: true },
    }));

  const fieldId = createId();
  await raw.user.create({
    data: {
      id: fieldId,
      email: `field-evidence-${Date.now()}@example.com`,
      name: "Field Evidence",
      role: Role.FIELD,
      passwordHash: await hashPassword("EvidencePass1!"),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    },
  });
  await raw.userArea.create({
    data: { id: createId(), userId: fieldId, areaId: area.id },
  });

  const clientId = createId();
  const siteId = createId();

  const WEIGHTS_9_FIRST = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  const WEIGHTS_9_SECOND = [3, 4, 5, 6, 7, 8, 9, 10] as const;
  function nineDigitCheckDigit(eightDigits: string): number {
    const digits = [...eightDigits].map((ch) => Number(ch));
    let sum = 0;
    for (let i = 0; i < WEIGHTS_9_FIRST.length; i++) sum += digits[i]! * WEIGHTS_9_FIRST[i]!;
    let remainder = sum % 11;
    if (remainder !== 10) return remainder;
    sum = 0;
    for (let i = 0; i < WEIGHTS_9_SECOND.length; i++) sum += digits[i]! * WEIGHTS_9_SECOND[i]!;
    remainder = sum % 11;
    return remainder === 10 ? 0 : remainder;
  }
  const base = String(Date.now()).slice(-8);
  const validEik = `${base}${nineDigitCheckDigit(base)}`;

  await runWithActorContextAsync(
    {
      source: "api",
      actorUserId: fieldId,
      actorLabel: "Field Evidence",
      requestId: "task11-evidence",
      ip: "127.0.0.1",
    },
    async () => {
      await prisma.transaction(async (tx) => {
        await tx.client.create({
          data: {
            id: clientId,
            kind: ClientKind.COMPANY,
            name: "Evidence Quick Client",
            nameNormalized: "evidence quick client",
            eik: validEik,
            isActive: true,
          },
        });
        await tx.site.create({
          data: {
            id: siteId,
            clientId,
            areaId: area.id,
            siteTypeId: type.id,
            name: "Evidence Quick Site",
            address: "ул. Evidence 1",
            status: SiteStatus.ACTIVE,
          },
        });
      });
    },
  );

  const rows = await raw.auditLog.findMany({
    where: { entityId: { in: [clientId, siteId] } },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      source: true,
      actorUserId: true,
      actorLabel: true,
      action: true,
      entityType: true,
      entityId: true,
    },
  });

  const out = resolve(__dirname, "../../../docs/evidence/task-11/quick-add-audit.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ clientId, siteId, fieldId, rows }, null, 2)}\n`);
  console.log(JSON.stringify(rows, null, 2));
  console.log(`wrote ${out}`);

  await prisma.$disconnect();
  await raw.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
