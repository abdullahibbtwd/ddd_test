import { Role } from "@ddcrm/shared";
import {
  FileSignature,
  FileText,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  BarChart3,
  Wallet,
  Users,
  CalendarCheck,
  Award,
  MapPinned,
} from "lucide-react";

export type NavPath =
  | "/"
  | "/clients"
  | "/sites"
  | "/month"
  | "/products"
  | "/invoices"
  | "/payments"
  | "/cash"
  | "/certificates"
  | "/agreements"
  | "/food"
  | "/reports"
  | "/settings";

export type NavKey =
  | "dashboard"
  | "clients"
  | "sites"
  | "month"
  | "products"
  | "invoices"
  | "payments"
  | "cash"
  | "certificates"
  | "agreements"
  | "food"
  | "reports"
  | "settings";

export interface NavItem {
  /** i18n key in the `nav` namespace. */
  key: NavKey;
  path: NavPath;
  icon: LucideIcon;
  /** Roles allowed to see and open the item. */
  roles: readonly Role[];
}

const ADMIN_OFFICE: readonly Role[] = [Role.ADMIN, Role.OFFICE];
const ALL_ROLES: readonly Role[] = [Role.ADMIN, Role.OFFICE, Role.FIELD];

/**
 * Role visibility (Task 17):
 * - ADMIN: all items
 * - OFFICE: all except Настройки
 * - FIELD: Табло, Обекти, Този месец, Каса (home = /) — no invoicing / outstanding
 * Visit create/edit stays on /visits/new and /visits/:id/edit (not in nav).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", path: "/", icon: LayoutDashboard, roles: ALL_ROLES },
  { key: "clients", path: "/clients", icon: Users, roles: ADMIN_OFFICE },
  { key: "sites", path: "/sites", icon: MapPinned, roles: ALL_ROLES },
  { key: "month", path: "/month", icon: CalendarCheck, roles: ALL_ROLES },
  { key: "products", path: "/products", icon: FlaskConical, roles: ADMIN_OFFICE },
  { key: "invoices", path: "/invoices", icon: FileText, roles: ADMIN_OFFICE },
  { key: "payments", path: "/payments", icon: Wallet, roles: ADMIN_OFFICE },
  { key: "cash", path: "/cash", icon: Wallet, roles: ALL_ROLES },
  { key: "certificates", path: "/certificates", icon: Award, roles: ADMIN_OFFICE },
  { key: "agreements", path: "/agreements", icon: FileSignature, roles: ADMIN_OFFICE },
  { key: "food", path: "/food", icon: FlaskConical, roles: ADMIN_OFFICE },
  { key: "reports", path: "/reports", icon: BarChart3, roles: ADMIN_OFFICE },
  { key: "settings", path: "/settings", icon: Settings, roles: [Role.ADMIN] },
];

export function navItemsForRole(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export type HomePath = "/";

export function homePathForRole(_role: Role): HomePath {
  return "/";
}

export function canAccessPath(role: Role, path: string): boolean {
  const normalized = path === "" ? "/" : path;
  // Settings / invoices / reports sub-routes inherit the parent nav role gate.
  const settingsMatch = normalized === "/settings" || normalized.startsWith("/settings/");
  const invoicesMatch = normalized === "/invoices" || normalized.startsWith("/invoices/");
  const reportsMatch = normalized === "/reports" || normalized.startsWith("/reports/");
  const item = settingsMatch
    ? NAV_ITEMS.find((nav) => nav.path === "/settings")
    : invoicesMatch
      ? NAV_ITEMS.find((nav) => nav.path === "/invoices")
      : reportsMatch
        ? NAV_ITEMS.find((nav) => nav.path === "/reports")
        : NAV_ITEMS.find((nav) => nav.path === normalized);
  if (!item) {
    // Non-nav routes (e.g. /change-password, /dev/styleguide) are not role-gated here.
    return true;
  }
  return item.roles.includes(role);
}
