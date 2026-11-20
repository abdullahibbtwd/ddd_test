import { describe, expect, it } from "vitest";
import {
  ARGON2_OPTIONS,
  assertPasswordRules,
  hashPassword,
  verifyPassword,
} from "../src/auth/password";

describe("password hashing (Argon2id)", () => {
  it("uses the configured Argon2id parameters", () => {
    expect(ARGON2_OPTIONS).toMatchObject({
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("enforces length and email inequality rules", () => {
    expect(() => assertPasswordRules("short", "a@b.com")).toThrow(/10/);
    expect(() => assertPasswordRules("a".repeat(129), "a@b.com")).toThrow(/128/);
    expect(() => assertPasswordRules("user@example.com", "user@example.com")).toThrow(/email/);
    expect(() => assertPasswordRules("long-enough-password", "user@example.com")).not.toThrow();
  });
});
