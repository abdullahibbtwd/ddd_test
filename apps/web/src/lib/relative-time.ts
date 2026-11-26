import type { TFunction } from "i18next";

/** Dynamic i18n keys stored on the notification row. */
export function notificationCopy(
  t: TFunction<"notifications">,
  key: string,
  params?: Record<string, string | number | undefined>,
): string {
  return t(key as "bell.label", (params ?? {}) as never) as unknown as string;
}

/** Bulgarian relative time for notification rows. */
export function formatRelativeBg(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (diffSec < 60) return "преди малко";
  const minutes = Math.round(diffSec / 60);
  if (minutes < 60) {
    return minutes === 1 ? "преди 1 минута" : `преди ${minutes} минути`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "преди 1 час" : `преди ${hours} часа`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "преди 1 ден" : `преди ${days} дни`;
}

export const BELL_POLL_MS = 60_000;

export function priorityBadgeVariant(priority: string): "warn" | "neutral" {
  return priority === "HIGH" ? "warn" : "neutral";
}
