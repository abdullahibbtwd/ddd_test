import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { meQueryOptions } from "@/auth/session";
import { canAccessPath, homePathForRole } from "@/config/nav";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/_shell")({
  beforeLoad: async ({ location }) => {
    let user;
    try {
      user = await queryClient.fetchQuery(meQueryOptions);
    } catch {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    if (user.mustChangePassword) {
      throw redirect({ to: "/change-password" });
    }

    const path = location.pathname;
    if (!canAccessPath(user.role, path)) {
      throw redirect({ to: homePathForRole(user.role) });
    }

    return { user };
  },
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
