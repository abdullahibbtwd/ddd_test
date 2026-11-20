import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authControllerLogin } from "@/api/generated/auth/auth";
import { isApiRequestError } from "@/api/mutator";
import { meQueryOptions } from "@/auth/session";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homePathForRole } from "@/config/nav";
import { translateApiError } from "@/lib/error-message";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    try {
      const user = await queryClient.fetchQuery(meQueryOptions);
      if (user.mustChangePassword) {
        throw redirect({ to: "/change-password" });
      }
      const target =
        search.redirect && search.redirect.startsWith("/")
          ? search.redirect
          : homePathForRole(user.role);
      throw redirect({ to: target });
    } catch (error) {
      if (error && typeof error === "object" && "to" in error) throw error;
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");
  const { t: te } = useTranslation("errors");
  const navigate = useNavigate();
  const search = Route.useSearch();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authControllerLogin({ email, password });
      const user = result.data.user;
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
      if (user.mustChangePassword) {
        await navigate({ to: "/change-password" });
        return;
      }
      const target =
        search.redirect && search.redirect.startsWith("/")
          ? search.redirect
          : homePathForRole(user.role);
      await navigate({ to: target });
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
        <p className="type-section mb-6">{t("productName")}</p>

        <div className="flex flex-col gap-4">
          <FormField label={t("login.email")} required>
            <Input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>

          <FormField label={t("login.password")} required>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={pending}>
            {t("login.submit")}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-bad-ink">
            {error}
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-ink-muted">{t("login.forgot")}</p>
      </form>
    </main>
  );
}
