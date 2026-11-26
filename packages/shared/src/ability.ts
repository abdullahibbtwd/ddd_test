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
  | "quickCreate"
  | "issue"
  | "cancelViaCreditNote"
  | "sendEmail"
  | "sendReminder"
  | "batchCreate"
  | "erase"
  | "export"
  | "renew";

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
  | "Invoice"
  | "Payment"
  | "CashHandover"
  | "CashLedger"
  | "Outstanding"
  | "Product"
  | "VisitProduct"
  | "MonitoringPoint"
  | "MonitoringPointCheck"
  | "ClientEmployee"
  | "HealthCertificate"
  | "Agreement"
  | "FoodSchedule"
  | "FoodRecord"
  | "Notification"
  | "Scheduling"
  | "Report"
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
 * Matrix (Task 18):
 * - ADMIN: manage all
 * - OFFICE: read Area; manage Client / Site / Subscription / Visit / Invoice;
 *   Invoice also: issue, cancelViaCreditNote, sendEmail, sendReminder, batchCreate;
 *   manage Payment / CashHandover; read Outstanding / CashLedger;
 *   manage Product / VisitProduct / MonitoringPoint / MonitoringPointCheck;
 *   manage ClientEmployee / HealthCertificate / Agreement / FoodSchedule /
 *   FoodRecord (export yes; erase no — ADMIN only);
 *   read SiteType; read Scheduling; read Report
 * - FIELD: read Area (assigned); read/create Site (assigned areas);
 *   read SiteType; read Client (scoped via siteAreaId); quickCreate Client;
 *   read Subscription when the site's area is in areaIds (siteAreaId);
 *   create/read/update Visit in assigned areas (ownership + 7d/24h windows
 *   are enforced in the API, not as CASL conditions);
 *   create/read Payment (visit ownership scoped in API);
 *   read CashLedger (self only, scoped in API);
 *   read Product (register browse); manage VisitProduct / MonitoringPointCheck
 *   for own unfrozen visits (ownership + freeze enforced in API);
 *   read MonitoringPoint; read Scheduling;
 *   read HealthCertificate (redacted certified-employees on assigned sites only;
 *   job title → '[скрито]'); no ClientEmployee manage/erase/export;
 *   no Invoice / Outstanding / CashHandover; no Product create/update/archive;
 *   no MonitoringPoint manage; no Agreement / FoodSchedule / FoodRecord;
 *   no Report; read + update Notification (own bell only — scoped in the API);
 *   no summary
 *
 * Invoice scope is role-only (all invoices visible to ADMIN/OFFICE).
 * No accessibleInvoiceWhere yet.
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
    can("manage", "Invoice");
    // Named Invoice actions (also implied by manage) — documented in PERMISSIONS.md.
    can("issue", "Invoice");
    can("cancelViaCreditNote", "Invoice");
    can("sendEmail", "Invoice");
    can("sendReminder", "Invoice");
    can("batchCreate", "Invoice");
    can("manage", "Payment");
    can("manage", "CashHandover");
    can("read", "Outstanding");
    can("read", "CashLedger");
    can("manage", "Product");
    can("manage", "VisitProduct");
    can("manage", "MonitoringPoint");
    can("manage", "MonitoringPointCheck");
    // Explicit CRUD + export; erase is ADMIN-only (manage would imply erase).
    can("create", "ClientEmployee");
    can("read", "ClientEmployee");
    can("update", "ClientEmployee");
    can("export", "ClientEmployee");
    can("manage", "HealthCertificate");
    can("manage", "Agreement");
    can("renew", "Agreement");
    can("manage", "FoodSchedule");
    can("manage", "FoodRecord");
    can("read", "SiteType");
    can("read", "Scheduling");
    // Phase 12 reports — ADMIN/OFFICE only (FIELD excluded).
    can("read", "Report");
    // Own bell: list + mark read / dismiss. Summary is ADMIN (`manage Notification`).
    can("read", "Notification");
    can("update", "Notification");
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
    // Payment create/read: visit ownership + collected_by scoped in the API.
    can("create", "Payment");
    can("read", "Payment");
    // Own cash ledger only (API forces employeeId = actor).
    can("read", "CashLedger");
    // Product register: browse only (no create/archive).
    can("read", "Product");
    // Visit children: ownership + freeze enforced in the API.
    can("manage", "VisitProduct");
    can("read", "MonitoringPoint");
    can("manage", "MonitoringPointCheck");
    can("read", "Scheduling");
    // Redacted certificate view for sites in assigned areas (API enforces).
    can("read", "HealthCertificate", { siteAreaId: { $in: areaIds } });
    can("read", "Notification");
    can("update", "Notification");
  }

  return build();
}
