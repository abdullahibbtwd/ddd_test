import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path, quiet: true });
      return;
    }
  }
}
