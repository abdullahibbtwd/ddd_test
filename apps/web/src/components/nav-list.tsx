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
  /** Dark forest-green sidebar styling. */
  variant?: "default" | "sidebar";
}

/** Single-level nav. Active item uses status=active from TanStack Router Link. */
export function NavList({
  role,
  onNavigate,
  className,
  variant = "default",
}: NavListProps) {
  const { t } = useTranslation("nav");
  const items = navItemsForRole(role);
  const sidebar = variant === "sidebar";

  return (
    <nav aria-label={t("primary")} className={className}>
      <ul className={cn("flex flex-col", sidebar ? "gap-1" : "gap-0.5")}>
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
                  "flex items-center gap-3 rounded-lg px-3 text-sm font-medium no-underline transition-colors",
                  "hover:no-underline",
                  sidebar
                    ? [
                        "py-2.5 text-[rgb(236_253_245/0.8)]",
                        "hover:bg-[rgb(255_255_255/0.1)] hover:text-[#ffffff]",
                        "data-[status=active]:bg-[#6BBF8A] data-[status=active]:font-semibold data-[status=active]:text-[#ffffff]",
                        "data-[status=active]:hover:bg-[#6BBF8A] data-[status=active]:hover:text-[#ffffff]",
                      ]
                    : [
                        "h-9 text-ink",
                        "hover:bg-neutral-bg hover:text-ink",
                        "data-[status=active]:bg-accent-tint data-[status=active]:text-accent",
                        "data-[status=active]:hover:bg-accent-tint data-[status=active]:hover:text-accent",
                      ],
                )}
              >
                <Icon
                  className={cn("shrink-0", sidebar ? "size-[18px]" : "size-4")}
                  aria-hidden="true"
                />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
