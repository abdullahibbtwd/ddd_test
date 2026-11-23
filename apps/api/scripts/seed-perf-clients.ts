/**
 * Inserts 5,000 clients into the SEPARATE perf database (ddcrm_perf).
 * Does not pollute the shared e2e/dev database.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/seed-perf-clients.ts
 *
 * Cleanup: drops ddcrm_perf unless PERF_KEEP=1.
 * See also seed-perf-sites.ts (clients + sites evidence).
 */
import { createId, normalizeClientName } from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { ClientKind, PrismaClient } from "../src/generated/prisma/client";
import {
  dropPerfDatabase,
  ensurePerfDatabase,
  migratePerfDatabase,
} from "./perf-db";

const PERF_TARGET = 5_000;
const PERF_NOTES_TAG = "__perf_seed_v1__";
const SEARCH_TERM = "рестор";

const WEIGHTS_9_FIRST = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const WEIGHTS_9_SECOND = [3, 4, 5, 6, 7, 8, 9, 10] as const;

function nineDigitCheckDigit(eightDigits: string): number {
  const digits = [...eightDigits].map((ch) => Number(ch));
  let sum = 0;
  for (let i = 0; i < WEIGHTS_9_FIRST.length; i++) {
    sum += digits[i]! * WEIGHTS_9_FIRST[i]!;
  }
  let remainder = sum % 11;
  if (remainder !== 10) return remainder;
  sum = 0;
  for (let i = 0; i < WEIGHTS_9_SECOND.length; i++) {
    sum += digits[i]! * WEIGHTS_9_SECOND[i]!;
  }
  remainder = sum % 11;
  return remainder === 10 ? 0 : remainder;
}

function perfEik(serial: number): string {
  const base = String(serial).padStart(8, "0").slice(-8);
  return `${base}${nineDigitCheckDigit(base)}`;
}

const NAME_FRAGMENTS = [
  "Ресторант",
  "Пицария",
  "Кафе",
  "Магазин",
  "Хотел",
  "Пекарна",
  "Бръчка",
  "Кетъринг",
  "Супермаркет",
  "Техника",
] as const;

const CITIES = ["София", "Пловдив", "Варна", "Бургас", "Русе", "Стара Загора"] as const;

function perfClientName(index: number): string {
  const kind = NAME_FRAGMENTS[index % NAME_FRAGMENTS.length]!;
  const city = CITIES[(index >> 3) % CITIES.length]!;
  return `${kind} ${city} Perf #${String(index).padStart(4, "0")} ООД`;
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
    const perfCount = await prisma.client.count({
      where: { notes: PERF_NOTES_TAG },
    });

    if (perfCount < PERF_TARGET) {
      const toCreate = PERF_TARGET - perfCount;
      console.log(`inserting ${toCreate} perf clients into ddcrm_perf (existing=${perfCount})…`);
      const batchSize = 200;
      let inserted = 0;
      let serial = perfCount + 1;

      while (inserted < toCreate) {
        const chunk = Math.min(batchSize, toCreate - inserted);
        const data = Array.from({ length: chunk }, (_, i) => {
          const idx = serial + i;
          const name = perfClientName(idx);
          return {
            id: createId(),
            kind: ClientKind.COMPANY,
            name,
            nameNormalized: normalizeClientName(name),
            eik: perfEik(1_000_000 + idx),
            isActive: true,
            notes: PERF_NOTES_TAG,
          };
        });
        await prisma.client.createMany({ data });
        serial += chunk;
        inserted += chunk;
      }
    } else {
      console.log(`perf seed already at ${perfCount} rows`);
    }

    const findManyStarted = performance.now();
    const listRows = await prisma.client.findMany({
      where: {
        isActive: true,
        name: { contains: SEARCH_TERM, mode: "insensitive" },
      },
      take: 50,
      orderBy: { name: "asc" },
    });
    const findManyMs = performance.now() - findManyStarted;

    const ilikePattern = `%${SEARCH_TERM}%`;
    // eslint-disable-next-line no-restricted-syntax -- evidence
    await prisma.$executeRawUnsafe(`SET enable_seqscan = off`);
    const forced = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, name FROM clients
      WHERE name ILIKE ${ilikePattern}
      LIMIT 50
    `;
    // eslint-disable-next-line no-restricted-syntax -- evidence
    await prisma.$executeRawUnsafe(`SET enable_seqscan = on`);
    const forcedPlan = forced.map((r) => r["QUERY PLAN"]).join("\n");

    const evidencePath = resolve(__dirname, "../../../docs/evidence/task-10/perf-explain.json");
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          database: "ddcrm_perf",
          perfClientCount: PERF_TARGET,
          searchTerm: SEARCH_TERM,
          timingMs: {
            findManyContainsInsensitive: Math.round(findManyMs * 100) / 100,
            under200ms: findManyMs < 200,
          },
          explain: { nameContainsIlkeForcedIndex: forcedPlan },
          indexUsed: {
            clients_name_trgm_idx: forcedPlan.includes("clients_name_trgm_idx"),
          },
          rows: listRows.length,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`findMany ${findManyMs.toFixed(2)} ms; wrote ${evidencePath}`);
  } finally {
    await prisma.$disconnect();
  }

  if (process.env.PERF_KEEP !== "1") {
    await dropPerfDatabase(env.DATABASE_URL);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
