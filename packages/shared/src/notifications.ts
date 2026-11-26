import { z } from "zod";
import { calendarDaysBetween } from "./compliance";
import { addCalendarDays } from "./visit-windows";

export const NotificationKind = {
  CERTIFICATE_EXPIRING: "CERTIFICATE_EXPIRING",
  AGREEMENT_EXPIRING: "AGREEMENT_EXPIRING",
  FOOD_SCHEDULE_DUE: "FOOD_SCHEDULE_DUE",
  INVOICE_OVERDUE: "INVOICE_OVERDUE",
} as const;

export const NotificationKindSchema = z.enum([
  NotificationKind.CERTIFICATE_EXPIRING,
  NotificationKind.AGREEMENT_EXPIRING,
  NotificationKind.FOOD_SCHEDULE_DUE,
  NotificationKind.INVOICE_OVERDUE,
]);

export type NotificationKind = z.infer<typeof NotificationKindSchema>;

/** Expiry reminders fire only on these exact day counts (Sofia calendar). */
export const EXPIRY_THRESHOLD_DAYS = [30, 14, 7] as const;

export const NotificationPriority = {
  NORMAL: "NORMAL",
  HIGH: "HIGH",
} as const;

export const NotificationPrioritySchema = z.enum([
  NotificationPriority.NORMAL,
  NotificationPriority.HIGH,
]);

export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

export const NotificationRecipientType = {
  SYSTEM_USER: "SYSTEM_USER",
  CLIENT_CONTACT: "CLIENT_CONTACT",
} as const;

export const NotificationRecipientTypeSchema = z.enum([
  NotificationRecipientType.SYSTEM_USER,
  NotificationRecipientType.CLIENT_CONTACT,
]);

export type NotificationRecipientType = z.infer<typeof NotificationRecipientTypeSchema>;

/**
 * Keys allowed in `body_params`. Never legal names of people, emails, phones, or EGN.
 * Site names, dates, invoice numbers, and system ids only.
 */
export const NOTIFICATION_BODY_PARAM_KEYS = [
  "siteName",
  "expiresAt",
  "dueDate",
  "invoiceNumber",
  "entityId",
  "employeeId",
  "siteId",
  "thresholdDay",
  "serviceType",
] as const;

export type NotificationBodyParamKey = (typeof NOTIFICATION_BODY_PARAM_KEYS)[number];

export type NotificationBodyParams = Partial<
  Record<NotificationBodyParamKey, string | number>
>;

const booleanQuery = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    return value === "true";
  });

export const NotificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Default true: the bell and the page start from unread rows. */
  unreadOnly: booleanQuery.default(true),
  kind: NotificationKindSchema.optional(),
  priority: NotificationPrioritySchema.optional(),
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationItemSchema = z.object({
  id: z.uuid(),
  kind: NotificationKindSchema,
  priority: NotificationPrioritySchema,
  entityType: z.string().min(1),
  entityId: z.uuid(),
  thresholdDay: z.number().int().nonnegative(),
  titleI18nKey: z.string().min(1),
  bodyI18nKey: z.string().min(1),
  bodyParams: z.record(z.string(), z.union([z.string(), z.number()])),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
  dismissedAt: z.string().datetime().nullable(),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const NotificationPageSchema = z.object({
  items: z.array(NotificationItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type NotificationPage = z.infer<typeof NotificationPageSchema>;

/** Mark-read has no body. The handler is idempotent and returns the row. */
export const NotificationMarkReadResultSchema = NotificationItemSchema;

/** Dismiss has no body. A second dismiss is NOTIFICATION_ALREADY_DISMISSED. */
export const NotificationDismissResultSchema = NotificationItemSchema;

export const NotificationReadAllResultSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type NotificationReadAllResult = z.infer<typeof NotificationReadAllResultSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const NotificationSummaryQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});

export type NotificationSummaryQuery = z.infer<typeof NotificationSummaryQuerySchema>;

export const NotificationSummaryKindSchema = z.object({
  kind: NotificationKindSchema,
  unread: z.number().int().nonnegative(),
  read: z.number().int().nonnegative(),
  dismissed: z.number().int().nonnegative(),
  /** CLIENT_CONTACT rows in the range. Count only — no body, no address. */
  clientContact: z.number().int().nonnegative(),
});

export const NotificationSummarySchema = z.object({
  from: dateString,
  to: dateString,
  kinds: z.array(NotificationSummaryKindSchema),
  clientContactTotal: z.number().int().nonnegative(),
});

export type NotificationSummary = z.infer<typeof NotificationSummarySchema>;

/**
 * True only when `expiresAt − asOf` is exactly `thresholdDays` and that
 * threshold has not already produced a notification.
 * Off-by-one (29, 15, 8, 6, …) is false. `asOf` is a calendar string
 * (callers pass `todayInSofia`); this function does not read the clock.
 */
export function shouldNotifyExpiring(input: {
  expiresAt: string;
  asOf: string;
  thresholdDays: number;
  alreadyNotifiedThresholds: readonly number[];
}): boolean {
  const delta = calendarDaysBetween(input.asOf, input.expiresAt);
  if (delta !== input.thresholdDays) return false;
  if (input.alreadyNotifiedThresholds.includes(input.thresholdDays)) return false;
  return true;
}

/**
 * CERTIFICATE_EXPIRING at 7 days is HIGH.
 * INVOICE_OVERDUE is HIGH at any threshold (the sweep uses 0).
 * Everything else is NORMAL.
 */
export function notificationPriority(
  kind: NotificationKind,
  thresholdDay: number,
): NotificationPriority {
  if (kind === NotificationKind.INVOICE_OVERDUE) {
    return NotificationPriority.HIGH;
  }
  if (kind === NotificationKind.CERTIFICATE_EXPIRING && thresholdDay === 7) {
    return NotificationPriority.HIGH;
  }
  return NotificationPriority.NORMAL;
}

/** Allowlisted i18n params from a row's JSONB. Unknown keys (names, email) are dropped. */
export function buildBodyParams(notification: {
  bodyParams: unknown;
}): NotificationBodyParams {
  if (notification.bodyParams === null || typeof notification.bodyParams !== "object") {
    return {};
  }
  const src = notification.bodyParams as Record<string, unknown>;
  const out: NotificationBodyParams = {};
  for (const key of NOTIFICATION_BODY_PARAM_KEYS) {
    const value = src[key];
    if (typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }
  return out;
}

/**
 * i18n keys stored on the row (namespace `notifications` on the web).
 * Client-contact agreement copy is the short "your agreement" sentence.
 */
export function notificationI18nKeys(
  kind: NotificationKind,
  recipientType: NotificationRecipientType,
): { titleI18nKey: string; bodyI18nKey: string } {
  if (
    recipientType === NotificationRecipientType.CLIENT_CONTACT &&
    kind === NotificationKind.AGREEMENT_EXPIRING
  ) {
    return {
      titleI18nKey: "kinds.AGREEMENT_EXPIRING.title",
      bodyI18nKey: "clientBody.AGREEMENT_EXPIRING",
    };
  }
  return {
    titleI18nKey: `kinds.${kind}.title`,
    bodyI18nKey: `kinds.${kind}.body`,
  };
}

/**
 * Click target by kind.
 * Agreements have no detail route in P11 (the list is the only page), so the
 * target is `/agreements?agreementId=`.
 */
export function notificationTargetPath(input: {
  kind: NotificationKind;
  entityId: string;
  bodyParams: unknown;
}): string {
  const params = buildBodyParams({ bodyParams: input.bodyParams });
  switch (input.kind) {
    case NotificationKind.CERTIFICATE_EXPIRING: {
      const parts: string[] = [];
      if (typeof params.employeeId === "string" && params.employeeId.length > 0) {
        parts.push(`employeeId=${params.employeeId}`);
      }
      if (typeof params.siteId === "string" && params.siteId.length > 0) {
        parts.push(`siteId=${params.siteId}`);
      }
      return parts.length > 0 ? `/certificates?${parts.join("&")}` : "/certificates";
    }
    case NotificationKind.AGREEMENT_EXPIRING:
      return `/agreements?agreementId=${input.entityId}`;
    case NotificationKind.FOOD_SCHEDULE_DUE:
      return "/food";
    case NotificationKind.INVOICE_OVERDUE:
      return `/invoices/${input.entityId}`;
  }
}

/** Calendar date `thresholdDays` after `asOf`. Used by the sweep and tests. */
export function expiryTargetDate(asOf: string, thresholdDays: number): string {
  return addCalendarDays(asOf, thresholdDays);
}
