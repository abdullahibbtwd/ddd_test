import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

const execFileAsync = promisify(execFile);

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Same major version as production / docker-compose (postgres:18.7-alpine). */
const POSTGRES_IMAGE = "postgres:18.7-alpine";

export type TestDb = {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  connectionString: string;
  resetDb: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Starts a disposable Postgres, applies all Prisma migrations, and returns a
 * Prisma client plus `resetDb()` for isolation between tests.
 *
 * Intended for integration / concurrency tests. Prefer this over the shared
 * docker-compose Postgres when the suite needs a clean, isolated database.
 */
export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase("ddcrm_test")
    .withUsername("ddcrm")
    .withPassword("ddcrm")
    .start();

  const connectionString = container.getConnectionUri();

  await execFileAsync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy"],
    {
      cwd: API_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        // prisma.config.ts loads dotenv; force the test URL.
        NODE_ENV: "test",
      },
    },
  );

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  async function resetDb(): Promise<void> {
    // Truncate every public table except Prisma's migrations bookkeeping.
    // audit_log is append-only (triggers reject TRUNCATE); disable its user
    // triggers briefly so tests can clear history.
    // Test-only truncate: audit_log triggers reject TRUNCATE, so disable USER
    // triggers briefly. Not an app write path — keep raw SQL here.
    // eslint-disable-next-line no-restricted-syntax -- test DB reset must clear append-only audit_log
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        IF to_regclass('public.audit_log') IS NOT NULL THEN
          ALTER TABLE audit_log DISABLE TRIGGER USER;
        END IF;
        FOR r IN (
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename <> '_prisma_migrations'
        ) LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        IF to_regclass('public.audit_log') IS NOT NULL THEN
          ALTER TABLE audit_log ENABLE TRIGGER USER;
        END IF;
      END $$;
    `);
    // Singleton gapless counter is seeded by migration; restore after TRUNCATE.
    if (
      (
        await prisma.$queryRaw<{ exists: boolean }[]>`
          SELECT to_regclass('public.invoice_counters') IS NOT NULL AS exists
        `
      )[0]?.exists
    ) {
      // eslint-disable-next-line no-restricted-syntax -- test DB reset re-seeds singleton counter
      await prisma.$executeRawUnsafe(`
        INSERT INTO invoice_counters (id, next_value) VALUES ('default', 1)
        ON CONFLICT (id) DO UPDATE SET next_value = 1
      `);
    }
  }

  async function stop(): Promise<void> {
    await prisma.$disconnect().catch(() => undefined);
    await container.stop();
  }

  return { container, prisma, connectionString, resetDb, stop };
}
