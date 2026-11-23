/**
 * Performance seed in a SEPARATE database (ddcrm_perf by default).
 * Creates 5,000 clients + 10,000 sites, times FIELD/OFFICE search, writes EXPLAIN.
 * Cleans up by dropping the perf database when PERF_KEEP=1 is not set.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/seed-perf-sites.ts
 *
 * Env:
 *   PERF_DATABASE_URL — optional explicit URL
 *   PERF_KEEP=1 — leave the perf DB after the run
 */
import { createId, normalizeClientName, Role } from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { ClientKind, PrismaClient, SiteStatus } from "../src/generated/prisma/client";
import {
  dropPerfDatabase,
  ensurePerfDatabase,
  migratePerfDatabase,
} from "./perf-db";

const CLIENT_TARGET = 5_000;
const SITE_TARGET = 10_000;
const SEARCH_TERM = "рестор";
const PERF_NOTES = "__perf_sites_v1__";

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

function perfEik(serial: number): string {
  const base = String(serial).padStart(8, "0").slice(-8);
  return `${base}${nineDigitCheckDigit(base)}`;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const perfUrl = await ensurePerfDatabase(env.DATABASE_URL, process.env.PERF_DATABASE_URL);
  await migratePerfDatabase(perfUrl);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: perfUrl }),
  });

  try {
    // Areas A/B for FIELD scoping
    const areaA = createId();
    const areaB = createId();
    const areaC = createId();
    for (const [id, name] of [
      [areaA, "Център"],
      [areaB, "Изток"],
      [areaC, "Запад"],
    ] as const) {
      await prisma.area.upsert({
        where: { id },
        create: { id, name, isActive: true },
        update: { name, isActive: true },
      }).catch(async () => {
        const existing = await prisma.area.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
        });
        if (!existing) {
          await prisma.area.create({ data: { id, name, isActive: true } });
        }
      });
    }
    const areas = await prisma.area.findMany({ where: { isActive: true }, take: 3 });
    const areaIds = areas.map((a) => a.id);
    while (areaIds.length < 3) areaIds.push(areaIds[0]!);

    const types = await prisma.siteType.findMany();
    if (types.length === 0) {
      throw new Error("site types missing after migrate");
    }

    const clientCount = await prisma.client.count({ where: { notes: PERF_NOTES } });
    if (clientCount < CLIENT_TARGET) {
      const toCreate = CLIENT_TARGET - clientCount;
      console.log(`inserting ${toCreate} perf clients…`);
      for (let offset = 0; offset < toCreate; offset += 200) {
        const chunk = Math.min(200, toCreate - offset);
        await prisma.client.createMany({
          data: Array.from({ length: chunk }, (_, i) => {
            const idx = clientCount + offset + i + 1;
            const name = `Ресторант Perf #${String(idx).padStart(4, "0")} ООД`;
            return {
              id: createId(),
              kind: ClientKind.COMPANY,
              name,
              nameNormalized: normalizeClientName(name),
              eik: perfEik(2_000_000 + idx),
              isActive: true,
              notes: PERF_NOTES,
            };
          }),
        });
      }
    }

    const siteCount = await prisma.site.count({ where: { notes: PERF_NOTES } });
    if (siteCount < SITE_TARGET) {
      const clients = await prisma.client.findMany({
        where: { notes: PERF_NOTES },
        select: { id: true, name: true },
      });
      const toCreate = SITE_TARGET - siteCount;
      console.log(`inserting ${toCreate} perf sites…`);
      for (let offset = 0; offset < toCreate; offset += 200) {
        const chunk = Math.min(200, toCreate - offset);
        await prisma.site.createMany({
          data: Array.from({ length: chunk }, (_, i) => {
            const idx = siteCount + offset + i;
            const client = clients[idx % clients.length]!;
            const areaId = areaIds[idx % areaIds.length]!;
            const type = types[idx % types.length]!;
            return {
              id: createId(),
              clientId: client.id,
              areaId,
              siteTypeId: type.id,
              name: `${client.name} сайт ${idx}`,
              address: `ул. Перф ${idx}, София`,
              latitude: 42.6 + (idx % 100) * 0.001,
              longitude: 23.2 + (idx % 100) * 0.001,
              status: SiteStatus.ACTIVE,
              notes: PERF_NOTES,
            };
          }),
        });
      }
    }

    // FIELD-like filter: two areas
    const fieldAreas = areaIds.slice(0, 2);
    const fieldStarted = performance.now();
    const fieldRows = await prisma.site.findMany({
      where: {
        areaId: { in: fieldAreas },
        status: SiteStatus.ACTIVE,
        OR: [
          { name: { contains: SEARCH_TERM, mode: "insensitive" } },
          { address: { contains: SEARCH_TERM, mode: "insensitive" } },
          { client: { name: { contains: SEARCH_TERM, mode: "insensitive" } } },
        ],
      },
      take: 50,
      orderBy: { name: "asc" },
    });
    const fieldMs = performance.now() - fieldStarted;

    const officeStarted = performance.now();
    const officeRows = await prisma.site.findMany({
      where: {
        status: SiteStatus.ACTIVE,
        OR: [
          { name: { contains: SEARCH_TERM, mode: "insensitive" } },
          { address: { contains: SEARCH_TERM, mode: "insensitive" } },
          { client: { name: { contains: SEARCH_TERM, mode: "insensitive" } } },
        ],
      },
      take: 50,
      orderBy: { name: "asc" },
    });
    const officeMs = performance.now() - officeStarted;

    const ilike = `%${SEARCH_TERM}%`;
    // eslint-disable-next-line no-restricted-syntax -- evidence
    await prisma.$executeRawUnsafe(`SET enable_seqscan = off`);
    const explainRows = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT s.id, s.name FROM sites s
      WHERE s.name ILIKE ${ilike}
      LIMIT 50
    `;
    // eslint-disable-next-line no-restricted-syntax -- evidence
    await prisma.$executeRawUnsafe(`SET enable_seqscan = on`);
    const explainPlan = explainRows.map((r) => r["QUERY PLAN"]).join("\n");

    console.log(`FIELD search (2 areas): ${fieldMs.toFixed(2)} ms, rows=${fieldRows.length}`);
    console.log(`OFFICE search: ${officeMs.toFixed(2)} ms, rows=${officeRows.length}`);
    console.log(explainPlan);

    const evidencePath = resolve(__dirname, "../../../docs/evidence/task-11/perf-explain.json");
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          database: "ddcrm_perf",
          clients: CLIENT_TARGET,
          sites: SITE_TARGET,
          searchTerm: SEARCH_TERM,
          fieldAreaCount: 2,
          timingMs: {
            fieldSearch: Math.round(fieldMs * 100) / 100,
            officeSearch: Math.round(officeMs * 100) / 100,
            fieldUnder200ms: fieldMs < 200,
            officeUnder200ms: officeMs < 200,
          },
          explain: { nameIlkeForced: explainPlan },
          indexHint: {
            sites_name_trgm_idx:
              explainPlan.includes("sites_name_trgm_idx") || explainPlan.includes("gin"),
          },
          roleNote: Role.FIELD,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`wrote ${evidencePath}`);
  } finally {
    await prisma.$disconnect();
  }

  if (process.env.PERF_KEEP !== "1") {
    await dropPerfDatabase(env.DATABASE_URL);
  } else {
    console.log("PERF_KEEP=1 — leaving ddcrm_perf in place");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
