import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authControllerChangePassword } from "@/api/generated/auth/auth";
import { isApiRequestError } from "@/api/mutator";
import { meQueryOptions } from "@/auth/session";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homePathForRole } from "@/config/nav";
import { translateApiError } from "@/lib/error-message";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/change-password")({
  beforeLoad: async () => {
    try {
      await queryClient.fetchQuery(meQueryOptions);
    } catch {
      throw redirect({ to: "/login", search: { redirect: "/change-password" } });
    }
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { t } = useTranslation("auth");
  const { t: te } = useTranslation("errors");
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== repeat) {
      setError(t("changePassword.mismatch"));
      return;
    }
    setPending(true);
    try {
      const result = await authControllerChangePassword({
        currentPassword,
        newPassword,
      });
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
      await navigate({ to: homePathForRole(result.data.user.role) });
    } catch (err) {
      if (isApiRequestError(err)) {
        setError(translateApiError(te, err.code));
      } else {
        setError(te("unknown"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-panel border border-border bg-surface p-6"
        noValidate
      >
        <p className="type-section mb-6">{t("changePassword.title")}</p>

        <div className="flex flex-col gap-4">
          <FormField label={t("changePassword.current")} required>
            <Input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              autoFocus
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </FormField>

          <FormField label={t("changePassword.new")} required>
            <Input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </FormField>

          <FormField label={t("changePassword.repeat")} required>
            <Input
              type="password"
              name="repeatPassword"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={pending}>
            {t("changePassword.submit")}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-bad-ink">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
