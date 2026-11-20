import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const pino = require("pino") as typeof import("pino");
import { LOGGER_REDACT_PATHS } from "../src/app.module";

/**
 * Pino's redact paths are applied by pino itself; we assert the configured
 * path list covers every sensitive field required by Task 7, then prove a
 * minimal redactor using the same path semantics removes values.
 */
function redactByPaths(
  value: unknown,
  paths: readonly string[],
  censor = "[Redacted]",
): unknown {
  const clone = structuredClone(value) as Record<string, unknown>;

  for (const path of paths) {
    if (path.startsWith("*.")) {
      const key = path.slice(2);
      const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        if (key in obj) obj[key] = censor;
        for (const child of Object.values(obj)) walk(child);
      };
      walk(clone);
      continue;
    }
    if (path.includes(".")) continue; // header paths covered separately
    if (path in clone) clone[path] = censor;
  }
  return clone;
}

describe("logger redaction", () => {
  it("configures redaction for password, currentPassword, newPassword and token fields", () => {
    const paths = LOGGER_REDACT_PATHS as readonly string[];
    expect(paths).toEqual(
      expect.arrayContaining([
        "*.password",
        "password",
        "*.currentPassword",
        "currentPassword",
        "*.newPassword",
        "newPassword",
        "*.temporaryPassword",
        "temporaryPassword",
        "*.token",
        "token",
      ]),
    );
  });

  it("redacts those fields from a log payload", () => {
    const payload = {
      password: "secret-password",
      currentPassword: "old-secret",
      newPassword: "new-secret",
      token: "raw-token-value",
      nested: { password: "nested-secret", token: "nested-token" },
      safe: "visible",
    };

    const redacted = redactByPaths(payload, LOGGER_REDACT_PATHS) as Record<string, unknown>;
    expect(redacted.safe).toBe("visible");
    expect(redacted.password).toBe("[Redacted]");
    expect(redacted.currentPassword).toBe("[Redacted]");
    expect(redacted.newPassword).toBe("[Redacted]");
    expect(redacted.token).toBe("[Redacted]");
    expect((redacted.nested as Record<string, unknown>).password).toBe("[Redacted]");
    expect((redacted.nested as Record<string, unknown>).token).toBe("[Redacted]");
  });

  it("pino redacts temporaryPassword in captured log output", () => {
    const chunks: string[] = [];
    const logger = pino(
      {
        redact: { paths: [...LOGGER_REDACT_PATHS], censor: "[Redacted]" },
      },
      {
        write(line: string) {
          chunks.push(line);
        },
      },
    );

    const secret = "temp-admin-password-xy";
    logger.info({
      temporaryPassword: secret,
      body: { temporaryPassword: secret },
    });

    const joined = chunks.join("");
    expect(joined).not.toContain(secret);
    expect(joined).toContain("[Redacted]");
  });
});
