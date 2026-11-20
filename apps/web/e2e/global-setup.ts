import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Creates e2e users if missing (admin@e2e.local, field@e2e.local).
 * Requires Postgres reachable via DATABASE_URL from the repo `.env`.
 */
async function globalSetup(): Promise<void> {
  await execFileAsync(
    "pnpm",
    ["--filter", "@ddcrm/api", "exec", "tsx", "scripts/seed-e2e-users.ts"],
    {
      cwd: ROOT,
      env: process.env,
    },
  );
}

export default globalSetup;
