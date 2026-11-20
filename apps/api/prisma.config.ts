import "dotenv/config";
import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) {
  loadDotenv({ path: rootEnv, quiet: true });
}

// Generate does not open a DB connection. Prefer DATABASE_URL from the
// environment / .env; fall back so `prisma generate` works in CI and on
// fresh clones before `.env` exists. migrate deploy still needs a real DB.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://ddcrm:ddcrm@127.0.0.1:5432/ddcrm";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
