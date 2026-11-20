import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) {
  loadDotenv({ path: rootEnv, quiet: true });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
