import type { AppAbility } from "@ddcrm/shared";
import type { Prisma } from "../generated/prisma/client";

type RuleLike = {
  inverted?: boolean;
  conditions?: object | null;
};

function readRules(
  ability: AppAbility,
  action: "read" | "manage",
  subject: "Area" | "Site" | "Client" | "Subscription" | "Visit",
) {
  return ability.rulesFor(action, subject).filter((rule: RuleLike) => !rule.inverted);
}

function extractInIds(
  rules: RuleLike[],
  field: "id" | "areaId" | "siteAreaId",
): string[] | "unrestricted" | "none" {
  if (rules.length === 0) return "none";
  if (
    rules.some(
      (rule) => !rule.conditions || Object.keys(rule.conditions).length === 0,
    )
  ) {
    return "unrestricted";
  }

  const ids = new Set<string>();
  for (const rule of rules) {
    const conditions = rule.conditions as Record<string, { $in?: string[] }> | undefined;
    const list = conditions?.[field]?.$in;
    if (Array.isArray(list)) {
      for (const id of list) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Turns a CASL ability into a Prisma `Area` where filter.
 *
 * Unconditional read/manage → `{}`; FIELD `$in` → `{ id: { in } }`;
 * no access → empty set (fail closed).
 */
export function accessibleAreaWhere(ability: AppAbility): Prisma.AreaWhereInput {
  if (ability.can("manage", "Area") || ability.can("manage", "all")) {
    return {};
  }

  const extracted = extractInIds(readRules(ability, "read", "Area"), "id");
  if (extracted === "unrestricted") return {};
  if (extracted === "none") return { id: { in: [] } };
  return { id: { in: extracted } };
}

/**
 * Prisma `Site` where matching FIELD `areaId: { $in }` conditions.
 * Must agree with `defineAbilityFor` Site read rules.
 */
export function accessibleSiteWhere(ability: AppAbility): Prisma.SiteWhereInput {
  if (ability.can("manage", "Site") || ability.can("manage", "all")) {
    return {};
  }

  const extracted = extractInIds(readRules(ability, "read", "Site"), "areaId");
  if (extracted === "unrestricted") return {};
  if (extracted === "none") return { id: { in: [] } };
  return { areaId: { in: extracted } };
}

/**
 * Prisma `Client` where for FIELD: clients that have at least one site whose
 * `areaId` is in the user's areas (`siteAreaId` CASL condition).
 * Must agree with `defineAbilityFor` Client read rules.
 */
export function accessibleClientWhere(ability: AppAbility): Prisma.ClientWhereInput {
  if (ability.can("manage", "Client") || ability.can("manage", "all")) {
    return {};
  }

  const extracted = extractInIds(readRules(ability, "read", "Client"), "siteAreaId");
  if (extracted === "unrestricted") return {};
  if (extracted === "none") return { id: { in: [] } };
  return { sites: { some: { areaId: { in: extracted } } } };
}

/**
 * Prisma `Subscription` where: applies `accessibleSiteWhere` to the parent site.
 * Must agree with FIELD `Subscription` read rules (`siteAreaId` ↔ site.areaId).
 */
export function accessibleSubscriptionWhere(
  ability: AppAbility,
): Prisma.SubscriptionWhereInput {
  if (ability.can("manage", "Subscription") || ability.can("manage", "all")) {
    return {};
  }

  const rules = readRules(ability, "read", "Subscription");
  if (rules.length === 0) {
    return { id: { in: [] } };
  }

  return { site: accessibleSiteWhere(ability) };
}

/**
 * Prisma `Visit` where: applies `accessibleSiteWhere` to the parent site.
 * Must agree with FIELD `Visit` read rules (`siteAreaId` ↔ site.areaId).
 */
export function accessibleVisitWhere(
  ability: AppAbility,
): Prisma.VisitWhereInput {
  if (ability.can("manage", "Visit") || ability.can("manage", "all")) {
    return {};
  }

  const rules = readRules(ability, "read", "Visit");
  if (rules.length === 0) {
    return { id: { in: [] } };
  }

  return { site: accessibleSiteWhere(ability) };
}

/**
 * "This Month" / scheduling lists: a site appears only if the caller can read it.
 * Same Prisma filter as `accessibleSiteWhere`.
 */
export function accessibleSchedulingWhere(
  ability: AppAbility,
): Prisma.SiteWhereInput {
  if (!ability.can("read", "Scheduling") && !ability.can("manage", "all")) {
    return { id: { in: [] } };
  }
  return accessibleSiteWhere(ability);
}

/** Re-export path for callers that imported the old file. */
export { accessibleAreaWhere as accessibleAreaWhereFromCentral };
