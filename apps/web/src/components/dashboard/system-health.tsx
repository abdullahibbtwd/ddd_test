import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/status-badge";
import { formatRelativeBg } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type Check = { key: string; label: string; up: boolean };

export function SystemHealthPanel({
  checks,
  checkedAt,
}: {
  checks: Check[];
  checkedAt?: string | null;
}) {
  const { t } = useTranslation("dashboard");

  return (
    <section className="rounded-xl border border-[#E2E8F0]/80 bg-[#ffffff] p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <h2 className="type-section">{t("sections.systemHealth")}</h2>
      <ul className="mt-4 space-y-3">
        {checks.map((check) => (
          <li key={check.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-sm text-[#334155]">
              <span
                className={cn(
                  "size-2 rounded-full",
                  check.up
                    ? "bg-[#10B981] shadow-[0_0_0_3px_rgb(16_185_129/0.2)]"
                    : "bg-[#9B3B3B]",
                )}
                aria-hidden="true"
              />
              {check.label}
            </span>
            <StatusBadge variant={check.up ? "ok" : "bad"}>
              {check.up ? t("health.ok") : t("health.down")}
            </StatusBadge>
          </li>
        ))}
      </ul>
      {checkedAt ? (
        <p className="mt-4 text-xs text-[#94A3B8]">
          {t("health.lastChecked", { time: formatRelativeBg(checkedAt) })}
        </p>
      ) : null}
    </section>
  );
}
