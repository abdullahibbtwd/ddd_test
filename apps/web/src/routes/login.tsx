import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authControllerLogin } from "@/api/generated/auth/auth";
import { isApiRequestError } from "@/api/mutator";
import { meQueryOptions } from "@/auth/session";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginDashboardIllustration } from "@/components/login-dashboard-illustration";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { homePathForRole } from "@/config/nav";
import { translateApiError } from "@/lib/error-message";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const REMEMBER_EMAIL_KEY = "ddcrm.login.rememberEmail";

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
  const { t: tc } = useTranslation("common");
  const { t: te } = useTranslation("errors");
  const navigate = useNavigate();
  const search = Route.useSearch();
  const emailRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    } catch {
      /* ignore storage errors */
    }
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        /* ignore storage errors */
      }

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

  const fieldInputClass = cn(
    "h-11 rounded-lg border-[#E2E8F0] bg-[#ffffff] pl-10",
    "focus-visible:border-[#1E6B4B] focus-visible:outline-[#1E6B4B]",
  );

  return (
    <main className="flex min-h-svh flex-col bg-[#F8FAFC] lg:grid lg:grid-cols-2">
      {/* Brand / hero panel */}
      <aside className="relative flex flex-col overflow-hidden bg-[#14452F] px-6 pt-6 pb-16 lg:min-h-svh lg:px-10 lg:py-10 lg:pb-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px)," +
              "radial-gradient(circle at 72% 68%, rgba(255,255,255,0.12) 0 1px, transparent 1.5px)," +
              "linear-gradient(135deg, transparent 48%, rgba(0,0,0,0.12) 48%, rgba(0,0,0,0.12) 52%, transparent 52%)," +
              "linear-gradient(45deg, transparent 62%, rgba(255,255,255,0.04) 62%)",
            backgroundSize: "28px 28px, 36px 36px, 120px 120px, 80px 80px",
          }}
        />
        <div
          className="pointer-events-none absolute -right-16 -bottom-20 size-72 rounded-[2rem] border border-[rgb(255_255_255/0.1)]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute right-10 bottom-24 size-40 rounded-[1.5rem] border border-[rgb(255_255_255/0.1)]"
          aria-hidden="true"
        />

        <p className="font-brand relative z-10 text-xl font-extrabold tracking-[0.06em] text-[#ffffff]">
          {t("productName")}
        </p>

        <div className="relative z-10 mt-5 flex flex-1 flex-col items-center lg:mt-0 lg:justify-center">
          {/* Mobile: title above illustration. Desktop: illustration then title below. */}
          <div className="w-full max-w-md text-center lg:order-2 lg:mt-10">
            <h1 className="text-[1.5rem] leading-tight text-[#ffffff] sm:text-[1.75rem]">
              <span className="font-brand font-extrabold tracking-[0.04em]">
                {t("productName")}
              </span>{" "}
              <span className="font-semibold tracking-tight">{t("login.heroTitleSuffix")}</span>
            </h1>
            <p className="mt-2 text-sm text-[#A7D4C0]">{t("login.heroSubtitle")}</p>
          </div>

          <div className="mt-6 w-full max-w-md translate-y-4 lg:order-1 lg:mt-0 lg:translate-y-0">
            <LoginDashboardIllustration className="origin-top scale-[0.92] sm:scale-100" />
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <section className="relative flex flex-1 flex-col lg:min-h-svh lg:items-center lg:justify-center lg:px-10 lg:py-10">
        <LanguageSwitcher
          id="language-switcher-desktop"
          variant="pill"
          className="absolute top-4 right-4 z-20 hidden lg:block"
        />

        <div className="relative z-10 flex w-full flex-1 flex-col lg:max-w-md lg:flex-none">
          <h2 className="mb-6 hidden text-center text-[1.75rem] font-bold tracking-tight text-[#1E293B] lg:block">
            {t("login.welcome")}
          </h2>

          <div
            className={cn(
              "relative -mt-8 flex flex-1 flex-col rounded-t-3xl bg-[#ffffff] px-6 pt-8 pb-10",
              "lg:mt-0 lg:flex-none lg:rounded-2xl lg:border lg:border-[#E2E8F0] lg:p-8",
              "lg:shadow-[0_12px_40px_rgb(15_23_42/0.08)]",
            )}
          >
            <div className="mb-6 flex items-start justify-between gap-3 lg:hidden">
              <h2 className="text-2xl font-bold tracking-tight text-[#1E293B]">
                {t("login.welcome")}
              </h2>
              <LanguageSwitcher
                id="language-switcher-mobile"
                variant="pill"
                className="shrink-0"
              />
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={emailId}>{t("login.email")}</Label>
                  <span className="text-xs text-ink-muted" aria-hidden="true">
                    * {tc("form.required")}
                  </span>
                </div>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <Input
                    ref={emailRef}
                    id={emailId}
                    type="email"
                    name="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("login.emailPlaceholder")}
                    required
                    className={fieldInputClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={passwordId}>{t("login.password")}</Label>
                  <span className="text-xs text-ink-muted" aria-hidden="true">
                    * {tc("form.required")}
                  </span>
                </div>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id={passwordId}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    required
                    className={cn(fieldInputClass, "pr-10")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:text-ink"
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={rememberId}
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    className="data-[state=checked]:border-[#1E6B4B] data-[state=checked]:bg-[#1E6B4B]"
                  />
                  <Label htmlFor={rememberId} className="font-normal text-ink">
                    {t("login.rememberMe")}
                  </Label>
                </div>
                <span className="text-sm font-medium text-[#1E6B4B]">{t("login.forgotPassword")}</span>
              </div>

              <Button
                type="submit"
                disabled={pending}
                className="h-11 w-full rounded-lg bg-[#1E6B4B] py-3 text-[#ffffff] hover:bg-[#165239]"
              >
                {t("login.submit")}
              </Button>

              {error ? (
                <p role="alert" className="text-center text-sm text-bad-ink">
                  {error}
                </p>
              ) : null}

              <p className="text-center text-sm text-ink-muted">{t("login.contactAdmin")}</p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
