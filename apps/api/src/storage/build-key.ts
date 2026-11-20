import { createId } from "@ddcrm/shared";

const SOFIA_TZ = "Europe/Sofia";

function sofiaYearMonth(date = new Date()): { yyyy: string; mm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SOFIA_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const yyyy = parts.find((part) => part.type === "year")?.value;
  const mm = parts.find((part) => part.type === "month")?.value;
  if (!yyyy || !mm) {
    throw new Error("Failed to format Europe/Sofia date for storage key");
  }
  return { yyyy, mm };
}

/**
 * Build an object key: `{domain}/{yyyy}/{mm}/{uuid}.{ext}`
 * Date parts use Europe/Sofia; uuid is UUID v7.
 */
export function buildKey(domain: string, ext: string, date = new Date()): string {
  if (!domain || domain.includes("/") || domain.includes("..")) {
    throw new Error("Invalid storage domain");
  }
  const cleanExt = ext.replace(/^\./, "");
  if (!cleanExt || cleanExt.includes("/") || cleanExt.includes("..")) {
    throw new Error("Invalid storage extension");
  }
  const { yyyy, mm } = sofiaYearMonth(date);
  return `${domain}/${yyyy}/${mm}/${createId()}.${cleanExt}`;
}
