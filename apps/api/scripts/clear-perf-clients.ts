/** Drops the separate ddcrm_perf database used by perf seeds. */
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { dropPerfDatabase } from "./perf-db";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv(process.env);
  await dropPerfDatabase(env.DATABASE_URL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
