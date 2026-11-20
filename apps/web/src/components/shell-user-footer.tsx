import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { AuthUser } from "@ddcrm/shared";
import { authControllerLogout } from "@/api/generated/auth/auth";
import { meQueryOptions } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query-client";

export function ShellUserFooter({
  user,
  onNavigate,
}: {
  user: AuthUser;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();

  async function logout() {
    try {
      await authControllerLogout();
    } catch {
      // Always clear local session state.
    }
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
    queryClient.clear();
    onNavigate?.();
    await navigate({ to: "/login" });
  }

  return (
    <div className="mt-auto border-t border-border px-3 pt-4 pb-1">
      <p className="text-sm font-medium text-ink">{user.name}</p>
      <p className="label mt-0.5">{t(`shell.role.${user.role}`)}</p>
      <Link
        to="/change-password"
        onClick={onNavigate}
        className="mt-3 block text-sm"
      >
        {t("shell.changePassword")}
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 -ml-2"
        onClick={() => void logout()}
      >
        {t("shell.logout")}
      </Button>
    </div>
  );
}
