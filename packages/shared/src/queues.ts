export const QUEUE_NAMES = {
  DEFAULT: "default",
  EMAIL: "email",
  PDF: "pdf",
  NOTIFICATIONS: "notifications",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_NAME_LIST = Object.values(QUEUE_NAMES);

/**
 * Build a deterministic BullMQ job id from parts.
 * Example: jobId('invoice-email', id) -> 'invoice-email_<id>'
 *
 * Parts are joined with '_' so we never hit BullMQ's ':' restrictions.
 */
export function jobId(...parts: Array<string | number | boolean>): string {
  if (parts.length === 0) {
    throw new Error("jobId requires at least one part");
  }
  const normalized = parts.map((part) => String(part));
  for (const part of normalized) {
    if (part.length === 0) {
      throw new Error("jobId parts must not be empty");
    }
    if (part.includes(":")) {
      throw new Error("jobId parts must not contain ':'");
    }
  }
  return normalized.join("_");
}
