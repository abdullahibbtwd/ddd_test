import { ScheduleStatus, type ScheduleStatus as ScheduleStatusT } from "@ddcrm/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const PULSE_STATUSES = [
  ScheduleStatus.SERVICED,
  ScheduleStatus.UPCOMING,
  ScheduleStatus.OVERDUE,
  ScheduleStatus.NOT_STARTED,
  ScheduleStatus.ENDED,
  ScheduleStatus.ON_DEMAND,
] as const;

/** Soft fills matched to Task 14 schedule status tokens. */
const BAR: Record<
  (typeof PULSE_STATUSES)[number],
  { fill: string; track: string; text: string }
> = {
  SERVICED: { fill: "#2F6B4F", track: "#E6EFE9", text: "#14452F" },
  UPCOMING: { fill: "#C48A1A", track: "#F8EED7", text: "#8A5A12" },
  OVERDUE: { fill: "#9B3B3B", track: "#F5E1E1", text: "#9B3B3B" },
  NOT_STARTED: { fill: "#94A3B8", track: "#EEF0F3", text: "#475569" },
  ENDED: { fill: "#64748B", track: "#EEF0F3", text: "#475569" },
  ON_DEMAND: { fill: "#788396", track: "#EEF0F3", text: "#475569" },
};

const CHART_H = 140;

export function SchedulePulse({
  counts,
  totalSites,
}: {
  counts: Record<ScheduleStatusT, number>;
  totalSites: number;
}) {
  const { t } = useTranslation("dashboard");
  const { t: tm } = useTranslation("month");
  const [hover, setHover] = useState<(typeof PULSE_STATUSES)[number] | null>(null);

  const columns = PULSE_STATUSES.map((status) => ({
    status,
    count: counts[status] ?? 0,
  })).filter((col) => col.count > 0);

  const max = Math.max(...columns.map((c) => c.count), 1);

  return (
    <section className="rounded-xl border border-[#E2E8F0]/80 bg-[#ffffff] p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="type-section">{t("sections.thisMonth")}</h2>
        <Link
          to="/month"
          className="text-sm font-medium text-[#14452F] no-underline hover:underline"
        >
          {t("schedule.totalSites", { count: totalSites })}
        </Link>
      </div>

      {columns.length === 0 ? (
        <p className="text-sm text-[#64748B]">{t("empty")}</p>
      ) : (
        <ul
          className="flex items-end justify-between gap-2 sm:gap-3"
          role="list"
          style={{ minHeight: CHART_H + 52 }}
        >
          {columns.map(({ status, count }) => {
            const colors = BAR[status];
            const barH = Math.max(Math.round((count / max) * CHART_H), 8);
            const dimmed = hover !== null && hover !== status;

            return (
              <li key={status} className="min-w-0 flex-1">
                <Link
                  to="/month"
                  onMouseEnter={() => setHover(status)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    "group flex flex-col items-center gap-2 no-underline transition-opacity hover:no-underline",
                    dimmed && "opacity-40",
                  )}
                >
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: colors.text }}
                  >
                    {count}
                  </span>

                  <span
                    className="flex w-full max-w-[3.25rem] items-end justify-center border-b border-[#E2E8F0]"
                    style={{ height: CHART_H }}
                    aria-hidden="true"
                  >
                    <span
                      className="w-full rounded-t-md transition-[height] duration-500 ease-out"
                      style={{
                        height: barH,
                        backgroundColor: colors.fill,
                      }}
                    />
                  </span>

                  <span className="w-full truncate text-center text-[11px] leading-tight text-[#64748B] group-hover:text-[#0F172A] sm:text-xs">
                    {tm(`tiles.${status}`)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
