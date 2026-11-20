import type { AppAbility } from "@ddcrm/shared";
import type { Prisma } from "../generated/prisma/client";

/**
 * Turns a CASL ability into a Prisma `Area` where filter.
 *
 * `@casl/prisma` 2.x + Prisma 7’s custom `prisma-client` generator needs a
 * project-specific runtime wrapper and `createPrismaAbility` (Mongo conditions
 * in `@ddcrm/shared` would not match). This helper keeps the same behaviour:
 * unconditional read/manage → `{}`; FIELD `$in` conditions → `{ id: { in } }`;
 * no access → empty set (fail closed).
 */
export function accessibleAreaWhere(ability: AppAbility): Prisma.AreaWhereInput {
  if (ability.can("manage", "Area") || ability.can("manage", "all")) {
    return {};
  }

  const rules = ability.rulesFor("read", "Area").filter((rule: { inverted?: boolean }) => !rule.inverted);
  if (rules.length === 0) {
    return { id: { in: [] } };
  }

  if (
    rules.some(
      (rule: { conditions?: object | null }) =>
        !rule.conditions || Object.keys(rule.conditions).length === 0,
    )
  ) {
    return {};
  }

  const ids = new Set<string>();
  for (const rule of rules) {
    const conditions = rule.conditions as { id?: { $in?: string[] } } | undefined;
    const list = conditions?.id?.$in;
    if (Array.isArray(list)) {
      for (const id of list) ids.add(id);
    }
  }
  return { id: { in: [...ids] } };
}
