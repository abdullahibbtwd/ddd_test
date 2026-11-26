import {
  NotificationKind,
  type NotificationKind as NotificationKindType,
} from "@ddcrm/shared";

/**
 * Recipient rules are code, not a table.
 *
 * CERTIFICATE_EXPIRING → OFFICE, ADMIN
 * AGREEMENT_EXPIRING   → OFFICE, ADMIN, and CLIENT_CONTACT when
 *                        client.notify_by_email is true (enforced by the sweep)
 * FOOD_SCHEDULE_DUE    → OFFICE + the LEAD on the site's latest active visit
 * INVOICE_OVERDUE      → OFFICE, ADMIN
 *
 * SYSTEM_USER email is always enqueued. CLIENT_CONTACT email is enqueued
 * only when the rule includes it and notify_by_email is true.
 */
export type NotificationRule = {
  kind: NotificationKindType;
  /** Active users in these roles receive a SYSTEM_USER row. */
  systemRoles: Array<"ADMIN" | "OFFICE">;
  /** Also notify the LEAD employee on the site's latest active visit. */
  includeFieldLead: boolean;
  /** Also notify the client when notify_by_email is true. */
  includeClientContact: boolean;
};

export const NOTIFICATION_RULES: Record<NotificationKindType, NotificationRule> = {
  [NotificationKind.CERTIFICATE_EXPIRING]: {
    kind: NotificationKind.CERTIFICATE_EXPIRING,
    systemRoles: ["OFFICE", "ADMIN"],
    includeFieldLead: false,
    includeClientContact: false,
  },
  [NotificationKind.AGREEMENT_EXPIRING]: {
    kind: NotificationKind.AGREEMENT_EXPIRING,
    systemRoles: ["OFFICE", "ADMIN"],
    includeFieldLead: false,
    includeClientContact: true,
  },
  [NotificationKind.FOOD_SCHEDULE_DUE]: {
    kind: NotificationKind.FOOD_SCHEDULE_DUE,
    systemRoles: ["OFFICE"],
    includeFieldLead: true,
    includeClientContact: false,
  },
  [NotificationKind.INVOICE_OVERDUE]: {
    kind: NotificationKind.INVOICE_OVERDUE,
    systemRoles: ["OFFICE", "ADMIN"],
    includeFieldLead: false,
    includeClientContact: false,
  },
};

export class RuleMisconfiguredError extends Error {
  constructor(readonly kind: string) {
    super(`RULE_MISCONFIGURED:${kind}`);
    this.name = "RuleMisconfiguredError";
  }
}

export function ruleFor(kind: string): NotificationRule {
  if (!Object.prototype.hasOwnProperty.call(NOTIFICATION_RULES, kind)) {
    throw new RuleMisconfiguredError(kind);
  }
  const rule = NOTIFICATION_RULES[kind as NotificationKindType];
  if (!rule || rule.kind !== kind) {
    throw new RuleMisconfiguredError(kind);
  }
  return rule;
}

/** Throws when the map is missing a known kind. Called at the start of a sweep. */
export function assertRulesCoverKnownKinds(): void {
  for (const kind of Object.values(NotificationKind)) {
    ruleFor(kind);
  }
}
