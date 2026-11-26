import type { AuthUser } from "@ddcrm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authControllerLogout } from "@/api/generated/auth/auth";
import { meQueryOptions } from "@/auth/session";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function ShellUserMenu({ user }: { user: AuthUser }) {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    try {
      await authControllerLogout();
    } catch {
      // Always clear local session state.
    }
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={triggerId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={user.name}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors",
          "hover:bg-[#F1F5F9]",
          open && "bg-[#F1F5F9]",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#D1FAE5] text-sm font-semibold text-[#065F46]">
          {initialsFor(user.name)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-semibold text-[#1E293B]">
            {user.name}
          </span>
          <span className="block truncate text-xs text-[#64748B]">
            {t(`shell.role.${user.role}`)}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "hidden size-4 shrink-0 text-[#64748B] transition-transform sm:block",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={cn(
            "absolute top-full right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#ffffff] py-1.5",
            "shadow-[0_12px_32px_rgb(15_23_42/0.12)]",
          )}
        >
          <Link
            role="menuitem"
            to="/change-password"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 text-sm text-[#1E293B] no-underline",
              "hover:bg-[#F8FAFC] hover:text-[#1E293B] hover:no-underline",
            )}
          >
            <KeyRound className="size-4 shrink-0 text-[#64748B]" aria-hidden="true" />
            {t("shell.changePassword")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#DC2626]",
              "hover:bg-[#FEF2F2]",
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {t("shell.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
