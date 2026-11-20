import {
  AbilityBuilder,
  createMongoAbility,
  type CreateAbility,
  type MongoAbility,
} from "@casl/ability";
import { Role } from "./role";

/** Actions available to abilities. */
export type AppAction = "manage" | "create" | "read" | "update" | "delete";

/**
 * Subjects used by the real product. `all` is CASL's wildcard for `manage`.
 * `Site` is intentionally absent here — it exists only in tests to prove
 * condition support for FIELD area scoping.
 */
export type AppSubject = "User" | "Area" | "AuditLog" | "Setting" | "all";

export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

export const createAppAbility = createMongoAbility as CreateAbility<AppAbility>;

export type AbilityUser = {
  id: string;
  role: Role;
  /** Active area ids — required for FIELD area scoping. */
  areaIds?: string[];
};

/**
 * Builds a CASL ability for the given user.
 *
 * Matrix (Task 9):
 * - ADMIN: manage User, Setting, AuditLog, Area
 * - OFFICE: read Area (all); no User / Setting / AuditLog
 * - FIELD: read Area only when `id` is in `areaIds`; no User / Setting / AuditLog
 *
 * Own-profile read/update stays on `/auth/*` (authenticated-only), not CASL.
 */
export function defineAbilityFor(user: AbilityUser): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createAppAbility);

  if (user.role === Role.ADMIN) {
    can("manage", "all");
    return build();
  }

  if (user.role === Role.OFFICE) {
    can("read", "Area");
    return build();
  }

  if (user.role === Role.FIELD) {
    const areaIds = user.areaIds ?? [];
    can("read", "Area", { id: { $in: areaIds } });
  }

  return build();
}

type TestSiteAbility = MongoAbility<["read" | "manage", "Site" | "all"]>;

/**
 * TEST-ONLY helper: proves condition support for FIELD area scoping.
 * Subject `Site` is not part of `AppSubject` and must not be used in production.
 */
export function defineTestSiteAbility(areaIds: string[]): TestSiteAbility {
  const { can, build } = new AbilityBuilder<TestSiteAbility>(createMongoAbility);
  can("read", "Site", { areaId: { $in: areaIds } });
  return build() as TestSiteAbility;
}
