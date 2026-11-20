import { Link, useRouteContext } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AbilityProvider } from "@/auth/ability";
import { Drawer } from "@/components/drawer";
import { NavList } from "@/components/nav-list";
import { ShellUserFooter } from "@/components/shell-user-footer";
import { Button } from "@/components/ui/button";
import { homePathForRole } from "@/config/nav";

function Brand({ home }: { home: "/" | "/visits" }) {
  const { t } = useTranslation();
  return (
    <Link
      to={home}
      className="block text-ink no-underline hover:text-ink hover:no-underline"
    >
      <span className="block text-[15px] leading-tight font-semibold">{t("app.name")}</span>
      <span className="label block">{t("app.tagline")}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useRouteContext({ from: "/_shell" });
  const [menuOpen, setMenuOpen] = useState(false);
  const home = homePathForRole(user.role);

  return (
    <AbilityProvider user={user}>
      <div className="min-h-svh md:flex">
        <aside className="hidden w-[220px] shrink-0 border-r border-border bg-surface md:block">
          <div className="sticky top-0 flex h-svh flex-col gap-6 overflow-y-auto px-3 py-5">
            <div className="px-3">
              <Brand home={home} />
            </div>
            <NavList role={user.role} />
            <ShellUserFooter user={user} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2"
              aria-label={t("actions.openMenu")}
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </Button>
            <Brand home={home} />
          </header>

          <main className="mx-auto w-full max-w-[1200px] p-4 md:p-6">{children}</main>
        </div>

        <Drawer
          side="left"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          title={t("app.name")}
          hideTitle
        >
          <div className="flex h-full flex-col">
            <NavList role={user.role} onNavigate={() => setMenuOpen(false)} />
            <ShellUserFooter user={user} onNavigate={() => setMenuOpen(false)} />
          </div>
        </Drawer>
      </div>
    </AbilityProvider>
  );
}
