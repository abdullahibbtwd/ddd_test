import { argon2id, hash, verify, type HashOptions } from "argon2";

/** OWASP-ish Argon2id parameters (explicit; do not rely on library defaults). */
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/** Precomputed dummy hash so unknown-email logins still pay Argon2 verify cost. */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$LzNzjH2tGLYz4AYeuRy8vA$1afLTJa4aCdSqU9AcoAk/aQzkJtatsiLNS1KqqspNOw";

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

export function assertPasswordRules(password: string, email: string): void {
  if (password.length < 10 || password.length > 128) {
    throw new Error("Password must be between 10 and 128 characters");
  }
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    throw new Error("Password must not equal the email");
  }
}
