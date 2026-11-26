import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useRouteContext } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AbilityProvider } from "@/auth/ability";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NavList } from "@/components/nav-list";
import { NotificationBell } from "@/components/notification-bell";
import { ShellUserMenu } from "@/components/shell-user-menu";
import { Button } from "@/components/ui/button";
import { homePathForRole } from "@/config/nav";
import { cn } from "@/lib/utils";

function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 3.5c3.2 1.1 5.8 3.9 6.4 7.4.5 3.1-.6 6-3.1 7.9-1.4 1.1-3.1 1.7-4.8 1.7-.5 0-1-.1-1.5-.2 2.1-1.1 3.5-3.3 3.5-5.8 0-3.4-2.5-6.2-5.8-6.7C8.2 5.1 10.1 3.9 12 3.5Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M7.2 12.2 10 15l6.2-7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandMark({
  home,
  onNavigate,
}: {
  home: "/";
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={home}
      onClick={onNavigate}
      className="flex items-start gap-2.5 text-[#ffffff] no-underline hover:text-[#ffffff] hover:no-underline"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(255_255_255/0.12)] text-[#A7D4C0]">
        <BrandIcon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="font-brand block text-[15px] leading-tight font-extrabold tracking-[0.04em]">
          {t("app.name")}
        </span>
        <span className="mt-0.5 block text-xs text-[rgb(167_243_208/0.7)]">{t("app.tagline")}</span>
      </span>
    </Link>
  );
}

function SidebarPanel({
  home,
  role,
  onNavigate,
  className,
}: {
  home: "/";
  role: Parameters<typeof NavList>[0]["role"];
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="px-6 pt-6 pb-4">
        <BrandMark home={home} onNavigate={onNavigate} />
      </div>
      <NavList
        role={role}
        variant="sidebar"
        onNavigate={onNavigate}
        className="flex-1 overflow-y-auto px-3 pb-6"
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useRouteContext({ from: "/_shell" });
  const [menuOpen, setMenuOpen] = useState(false);
  const home = homePathForRole(user.role);

  return (
    <AbilityProvider user={user}>
      <div className="flex min-h-svh bg-[#F8FAFC]">
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 bg-[#14452F] lg:flex lg:flex-col">
          <SidebarPanel home={home} role={user.role} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#E2E8F0] bg-[#ffffff] px-4 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-1 lg:hidden"
              aria-label={t("actions.openMenu")}
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </Button>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <NotificationBell />
              <LanguageSwitcher
                id="language-switcher-navbar"
                variant="navbar"
              />
              <ShellUserMenu user={user} />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>

        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              className={cn(
                "fixed inset-0 z-40 bg-[rgb(0_0_0/0.5)] backdrop-blur-[2px]",
                "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
              )}
            />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className={cn(
                "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#14452F]",
                "data-[state=open]:animate-drawer-left-in data-[state=closed]:animate-drawer-left-out",
              )}
            >
              <DialogPrimitive.Title className="sr-only">{t("app.name")}</DialogPrimitive.Title>
              <div className="relative flex h-full flex-col">
                <DialogPrimitive.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("actions.closeMenu")}
                    className="absolute top-4 right-3 z-10 text-[#ffffff] hover:bg-[rgb(255_255_255/0.1)] hover:text-[#ffffff]"
                  >
                    <X />
                  </Button>
                </DialogPrimitive.Close>
                <SidebarPanel
                  home={home}
                  role={user.role}
                  onNavigate={() => setMenuOpen(false)}
                  className="pr-10"
                />
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </AbilityProvider>
  );
}
