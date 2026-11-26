import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MoneyAmount } from "@/components/dashboard/money-amount";
import { cn } from "@/lib/utils";

const BUCKETS = [
  { key: "0_30", color: "#6BBF8A", labelKey: "aging.bucket0_30" as const },
  { key: "31_60", color: "#E0A800", labelKey: "aging.bucket31_60" as const },
  { key: "61_90", color: "#D97706", labelKey: "aging.bucket61_90" as const },
  { key: "90_plus", color: "#B45353", labelKey: "aging.bucket90" as const },
] as const;

export function AgingBar({
  totals,
  counts,
}: {
  totals: {
    outstanding: number;
    "0_30": number;
    "31_60": number;
    "61_90": number;
    "90_plus": number;
  };
  counts?: Partial<Record<(typeof BUCKETS)[number]["key"], number>>;
}) {
  const { t } = useTranslation("dashboard");
  const sum =
    totals["0_30"] + totals["31_60"] + totals["61_90"] + totals["90_plus"] || 1;

  return (
    <section className="rounded-xl border border-[#E2E8F0]/80 bg-[#ffffff] p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="type-section">{t("sections.aging")}</h2>
          <p className="mt-1 text-xs text-[#64748B]">{t("aging.totalUnpaid")}</p>
        </div>
        <MoneyAmount amount={totals.outstanding} size="lg" />
      </div>

      <div className="flex h-7 overflow-hidden rounded-lg bg-[#EEF0F3]">
        {BUCKETS.map((bucket) => {
          const value = totals[bucket.key];
          if (value <= 0) return null;
          const pct = (value / sum) * 100;
          return (
            <div
              key={bucket.key}
              className="relative flex items-center justify-center overflow-hidden"
              style={{ width: `${pct}%`, backgroundColor: bucket.color, minWidth: 8 }}
              title={`${t(bucket.labelKey)}: ${value.toFixed(2)}`}
            >
              {pct >= 18 ? (
                <span className="truncate px-1 text-[10px] font-semibold text-[#ffffff] tabular-nums">
                  {Math.round(pct)}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 divide-y divide-[#E2E8F0]/80">
        {BUCKETS.map((bucket) => {
          const value = totals[bucket.key];
          const count = counts?.[bucket.key];
          return (
            <li key={bucket.key}>
              <Link
                to="/reports/$kind"
                params={{ kind: "outstanding" }}
                className={cn(
                  "flex items-center justify-between gap-3 py-2.5 text-sm no-underline",
                  "hover:bg-[#F8FAFC] hover:no-underline",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: bucket.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-[#334155]">{t(bucket.labelKey)}</span>
                  {count !== undefined ? (
                    <span className="text-xs text-[#94A3B8]">
                      {t("aging.invoices", { count })}
                    </span>
                  ) : null}
                </span>
                <MoneyAmount amount={value} size="sm" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
