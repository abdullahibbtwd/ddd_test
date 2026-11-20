import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";

describe("postgres extensions", () => {
  let prisma: InstanceType<typeof import("../src/generated/prisma/client").PrismaClient>;

  beforeAll(async () => {
    loadEnvFiles();
    const env = parseEnv({ ...process.env, NODE_ENV: "test" });
    const { PrismaClient } = await import("../src/generated/prisma/client");
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("has pg_trgm, unaccent and pgcrypto enabled", async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('pg_trgm', 'unaccent', 'pgcrypto')
      ORDER BY extname
    `;
    expect(rows.map((row) => row.extname)).toEqual(["pg_trgm", "pgcrypto", "unaccent"]);
  });

  it("returns a high similarity score for Cyrillic case variants", async () => {
    const rows = await prisma.$queryRaw<Array<{ score: number }>>`
      SELECT similarity('Ресторант', 'ресторант') AS score
    `;
    expect(rows[0]?.score).toBeGreaterThan(0.8);
  });
});
