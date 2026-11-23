import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Can } from "@/auth/ability";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_shell/settings")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings" || location.pathname === "/settings/") {
      throw redirect({ to: "/settings/users" });
    }
  },
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t: tAudit } = useTranslation("audit");
  const { t: tUsers } = useTranslation("users");
  const { t: tAreas } = useTranslation("areas");
  const { t: tSites } = useTranslation("sites");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tab = pathname.includes("/settings/areas")
    ? "areas"
    : pathname.includes("/settings/site-types")
      ? "site-types"
      : pathname.includes("/settings/audit")
        ? "audit"
        : "users";

  return (
    <div>
      <PageHeader title={tAudit("title")} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "users") void navigate({ to: "/settings/users" });
          else if (value === "areas") void navigate({ to: "/settings/areas" });
          else if (value === "site-types") void navigate({ to: "/settings/site-types" });
          else if (value === "audit") void navigate({ to: "/settings/audit" });
        }}
      >
        <TabsList>
          <Can I="manage" a="User">
            <TabsTrigger value="users">{tUsers("tab")}</TabsTrigger>
          </Can>
          <Can I="manage" a="Area">
            <TabsTrigger value="areas">{tAreas("tab")}</TabsTrigger>
          </Can>
          <Can I="manage" a="SiteType">
            <TabsTrigger value="site-types">{tSites("tab")}</TabsTrigger>
          </Can>
          <Can I="read" a="AuditLog">
            <TabsTrigger value="audit">{tAudit("tab")}</TabsTrigger>
          </Can>
        </TabsList>
      </Tabs>
      <div className="pt-4">
        <Outlet />
      </div>
    </div>
  );
}