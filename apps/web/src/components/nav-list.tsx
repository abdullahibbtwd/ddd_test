import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Role } from "@ddcrm/shared";
import { navItemsForRole } from "@/config/nav";
import { cn } from "@/lib/utils";

export interface NavListProps {
  role: Role;
  /** Called after a link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
}

/** Single-level nav. Active item: accent-tint background + accent text. */
export function NavList({ role, onNavigate, className }: NavListProps) {
  const { t } = useTranslation("nav");
  const items = navItemsForRole(role);

  return (
    <nav aria-label={t("primary")} className={className}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                to={item.path}
                activeOptions={{ exact: item.path === "/" }}
                onClick={onNavigate}
                data-nav-key={item.key}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-control px-3 text-sm font-medium text-ink",
                  "no-underline transition-colors hover:bg-neutral-bg hover:text-ink hover:no-underline",
                  "data-[status=active]:bg-accent-tint data-[status=active]:text-accent",
                  "data-[status=active]:hover:bg-accent-tint data-[status=active]:hover:text-accent",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
