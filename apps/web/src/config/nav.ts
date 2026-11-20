import { Role } from "@ddcrm/shared";
import {
  FileSignature,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  BarChart3,
  Wallet,
  Users,
  CalendarCheck,
  Award,
} from "lucide-react";

export type NavPath =
  | "/"
  | "/clients"
  | "/visits"
  | "/invoices"
  | "/payments"
  | "/certificates"
  | "/agreements"
  | "/reports"
  | "/settings";

export type NavKey =
  | "dashboard"
  | "clients"
  | "visits"
  | "invoices"
  | "payments"
  | "certificates"
  | "agreements"
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
const FIELD_MONEY: readonly Role[] = [Role.ADMIN, Role.OFFICE, Role.FIELD];

/**
 * Role visibility (Task 7):
 * - ADMIN: all items
 * - OFFICE: all except Настройки
 * - FIELD: Посещения, Фактури, Плащания only
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", path: "/", icon: LayoutDashboard, roles: ADMIN_OFFICE },
  { key: "clients", path: "/clients", icon: Users, roles: ADMIN_OFFICE },
  { key: "visits", path: "/visits", icon: CalendarCheck, roles: FIELD_MONEY },
  { key: "invoices", path: "/invoices", icon: FileText, roles: FIELD_MONEY },
  { key: "payments", path: "/payments", icon: Wallet, roles: FIELD_MONEY },
  { key: "certificates", path: "/certificates", icon: Award, roles: ADMIN_OFFICE },
  { key: "agreements", path: "/agreements", icon: FileSignature, roles: ADMIN_OFFICE },
  { key: "reports", path: "/reports", icon: BarChart3, roles: ADMIN_OFFICE },
  { key: "settings", path: "/settings", icon: Settings, roles: [Role.ADMIN] },
];

export function navItemsForRole(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export type HomePath = "/" | "/visits";

export function homePathForRole(role: Role): HomePath {
  return role === Role.FIELD ? "/visits" : "/";
}

export function canAccessPath(role: Role, path: string): boolean {
  const normalized = path === "" ? "/" : path;
  // Settings sub-routes (e.g. /settings/audit) inherit the Настройки role gate.
  const settingsMatch = normalized === "/settings" || normalized.startsWith("/settings/");
  const item = settingsMatch
    ? NAV_ITEMS.find((nav) => nav.path === "/settings")
    : NAV_ITEMS.find((nav) => nav.path === normalized);
  if (!item) {
    // Non-nav routes (e.g. /change-password, /dev/styleguide) are not role-gated here.
    return true;
  }
  return item.roles.includes(role);
}
