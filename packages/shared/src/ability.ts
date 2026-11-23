import {
  AbilityBuilder,
  createMongoAbility,
  type CreateAbility,
  type MongoAbility,
} from "@casl/ability";
import { Role } from "./role";

/** Actions available to abilities. */
export type AppAction =
  | "manage"
  | "create"
  | "read"
  | "update"
  | "delete"
  | "quickCreate";

/**
 * Subjects used by the real product. `all` is CASL's wildcard for `manage`.
 */
export type AppSubject =
  | "User"
  | "Area"
  | "Client"
  | "Site"
  | "SiteType"
  | "Subscription"
  | "Visit"
  | "Scheduling"
  | "AuditLog"
  | "Setting"
  | "all";

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
 * Matrix (Task 14):
 * - ADMIN: manage all
 * - OFFICE: read Area; manage Client / Site / Subscription / Visit; read SiteType;
 *   read Scheduling
 * - FIELD: read Area (assigned); read/create Site (assigned areas);
 *   read SiteType; read Client (scoped via siteAreaId); quickCreate Client;
 *   read Subscription when the site's area is in areaIds (siteAreaId);
 *   create/read/update Visit in assigned areas (ownership + 7d/24h windows
 *   are enforced in the API, not as CASL conditions);
 *   read Scheduling (site visibility via accessibleSiteWhere)
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
    // Read-only users list for «Този месец» employee filter (no create/update/reset).
    can("read", "User");
    can("manage", "Client");
    can("manage", "Site");
    can("manage", "Subscription");
    can("manage", "Visit");
    can("read", "SiteType");
    can("read", "Scheduling");
    return build();
  }

  if (user.role === Role.FIELD) {
    const areaIds = user.areaIds ?? [];
    can("read", "Area", { id: { $in: areaIds } });
    can("read", "Site", { areaId: { $in: areaIds } });
    can("create", "Site", { areaId: { $in: areaIds } });
    can("read", "SiteType");
    // `siteAreaId` mirrors Site.areaId for agreement with accessibleClientWhere
    // (clients that have at least one site in these areas).
    can("read", "Client", { siteAreaId: { $in: areaIds } });
    can("quickCreate", "Client");
    // Subscription scoped by the parent site's area (same siteAreaId field).
    can("read", "Subscription", { siteAreaId: { $in: areaIds } });
    // Visit scoped by the parent site's area; ownership/windows in the API.
    can("read", "Visit", { siteAreaId: { $in: areaIds } });
    can("create", "Visit", { siteAreaId: { $in: areaIds } });
    can("update", "Visit", { siteAreaId: { $in: areaIds } });
    can("read", "Scheduling");
  }

  return build();
}
