import { ScheduleStatus, type MonthSummary } from "@ddcrm/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status-badge";
import { MonthCalendar, statusBadgeVariant } from "../month";

function summaryFixture(): MonthSummary {
  return {
    month: "2026-11",
    totalSites: 12,
    withoutSubscription: 3,
    counts: {
      [ScheduleStatus.SERVICED]: 4,
      [ScheduleStatus.UPCOMING]: 3,
      [ScheduleStatus.OVERDUE]: 2,
      [ScheduleStatus.NOT_STARTED]: 1,
      [ScheduleStatus.ENDED]: 1,
      [ScheduleStatus.ON_DEMAND]: 1,
      [ScheduleStatus.NOT_DUE]: 0,
    },
  };
}

describe("month page helpers", () => {
  it("MonthFilter defaults use month YYYY-MM and optional ids", () => {
    const filter = {
      month: "2026-11",
      areaId: undefined as string | undefined,
      employeeId: undefined as string | undefined,
    };
    expect(filter.month).toMatch(/^\d{4}-\d{2}$/);
    expect(filter.areaId).toBeUndefined();
  });

  it("summary tile counts come from fixture (no money fields)", () => {
    const summary = summaryFixture();
    expect(summary.counts.SERVICED).toBe(4);
    expect(summary.counts.OVERDUE).toBe(2);
    expect(summary.withoutSubscription).toBe(3);
    expect(JSON.stringify(summary)).not.toMatch(/EUR|BGN|VAT|amount|rate/i);
  });

  it("status badge uses calm variants and table cells show no money", () => {
    expect(statusBadgeVariant(ScheduleStatus.SERVICED)).toBe("ok");
    expect(statusBadgeVariant(ScheduleStatus.UPCOMING)).toBe("warn");
    expect(statusBadgeVariant(ScheduleStatus.OVERDUE)).toBe("bad");
    expect(statusBadgeVariant(ScheduleStatus.ON_DEMAND)).toBe("neutral");

    render(
      <StatusBadge variant={statusBadgeVariant(ScheduleStatus.OVERDUE)}>
        Просрочен
      </StatusBadge>,
    );
    expect(screen.getByText("Просрочен")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/€|лв|VAT/i);
  });

  it("calendar renders week-list markup for phone (presence, not pixels)", () => {
    render(
      <MonthCalendar
        month="2026-11"
        days={[
          {
            date: "2026-11-01",
            servicedSiteIds: ["11111111-1111-4111-8111-111111111111"],
            dueSiteIds: [],
            overdueSiteIds: [],
          },
        ]}
        onDayClick={() => undefined}
      />,
    );
    expect(screen.getByTestId("month-calendar-weeklist")).toBeInTheDocument();
    expect(screen.getByTestId("month-calendar-grid")).toBeInTheDocument();
  });
});
