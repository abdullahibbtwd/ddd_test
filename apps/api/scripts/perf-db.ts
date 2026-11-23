/**
 * Helpers for performance seeds that must not pollute the shared e2e/dev database.
 *
 * Resolution order for the perf database URL:
 *   1. PERF_DATABASE_URL
 *   2. Derive from DATABASE_URL by replacing the path with `/ddcrm_perf`
 *
 * The script creates the database if missing, runs migrations, and callers should
 * drop or truncate after evidence is collected.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const execFileAsync = promisify(execFile);
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PERF_DB_NAME = "ddcrm_perf";

export function resolvePerfDatabaseUrl(databaseUrl: string, perfUrl?: string): string {
  if (perfUrl && perfUrl.trim() !== "") return perfUrl.trim();
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${PERF_DB_NAME}`;
  return parsed.toString();
}

export function adminDatabaseUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

export async function ensurePerfDatabase(databaseUrl: string, perfUrl?: string): Promise<string> {
  const target = resolvePerfDatabaseUrl(databaseUrl, perfUrl);
  const adminUrl = adminDatabaseUrl(databaseUrl);
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const found = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
      [PERF_DB_NAME],
    );
    if (!found.rows[0]?.exists) {
      await client.query(`CREATE DATABASE ${PERF_DB_NAME}`);
      console.log(`created database ${PERF_DB_NAME}`);
    } else {
      console.log(`database ${PERF_DB_NAME} already exists`);
    }
  } finally {
    await client.end();
  }
  return target;
}

export async function migratePerfDatabase(perfDatabaseUrl: string): Promise<void> {
  await execFileAsync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: perfDatabaseUrl,
      NODE_ENV: process.env.NODE_ENV ?? "development",
    },
  });
}

/** Drop the perf database entirely (cleanup after evidence). */
export async function dropPerfDatabase(databaseUrl: string): Promise<void> {
  const adminUrl = adminDatabaseUrl(databaseUrl);
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [PERF_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${PERF_DB_NAME}`);
    console.log(`dropped database ${PERF_DB_NAME}`);
  } finally {
    await client.end();
  }
}
