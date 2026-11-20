import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "./db";

/**
 * Example integration test backed by Testcontainers (not the shared docker-compose
 * Postgres). Proves `startTestDb()` applies migrations and exposes a working client.
 */
describe("testcontainers db helper", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await db.stop();
  });

  it("has pg_trgm, unaccent and pgcrypto enabled", async () => {
    const rows = await db.prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('pg_trgm', 'unaccent', 'pgcrypto')
      ORDER BY extname
    `;
    expect(rows.map((row) => row.extname)).toEqual(["pg_trgm", "pgcrypto", "unaccent"]);
  });

  it("returns a high similarity score for Cyrillic case variants", async () => {
    const rows = await db.prisma.$queryRaw<Array<{ score: number }>>`
      SELECT similarity('Ресторант', 'ресторант') AS score
    `;
    expect(rows[0]?.score).toBeGreaterThan(0.8);
  });

  it("resetDb runs without error on an empty schema", async () => {
    await expect(db.resetDb()).resolves.toBeUndefined();
  });
});
