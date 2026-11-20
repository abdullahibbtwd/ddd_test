import { parsePhoneNumberFromString } from "libphonenumber-js";
import { ErrorCode } from "./errors";

/** Thrown when a phone number cannot be normalized to E.164. */
export class PhoneValidationError extends Error {
  readonly code = ErrorCode.VALIDATION_FAILED;

  constructor(message = "Invalid phone number") {
    super(message);
    this.name = "PhoneValidationError";
  }
}

const DEFAULT_REGION = "BG" as const;

/**
 * Normalize a phone number to E.164 using Bulgaria as the default region.
 * Accepts local (`0888…`), `+359…`, and `00359…` forms.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PhoneValidationError("Phone number is required");
  }

  // libphonenumber-js does not treat 00 as +; normalize that first.
  const candidate = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, DEFAULT_REGION);
  if (!parsed || !parsed.isValid()) {
    throw new PhoneValidationError("Invalid phone number");
  }
  return parsed.format("E.164");
}

/** Format an E.164 number for display (national format for BG, international otherwise). */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed || !parsed.isValid()) {
    throw new PhoneValidationError("Invalid phone number");
  }
  if (parsed.country === "BG") {
    return parsed.formatNational();
  }
  return parsed.formatInternational();
}
