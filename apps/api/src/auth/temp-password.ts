import { randomInt } from "node:crypto";

/** Unambiguous alphabet: no 0/O/1/l/I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * 14 characters from an unambiguous alphabet, grouped as `xxxx-xxxx-xxxx-xx`
 * (dashes are part of the password; length with dashes is 17, still within 10–128).
 */
export function generateTemporaryPassword(): string {
  const chars: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    chars.push(ALPHABET[randomInt(ALPHABET.length)]!);
  }
  const raw = chars.join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
}
