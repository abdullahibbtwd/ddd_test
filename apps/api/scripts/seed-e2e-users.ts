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
import { createId, Role } from "@ddcrm/shared";
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
