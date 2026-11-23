import { describe, expect, it } from "vitest";
import { ScheduleStatus } from "./schedule-status";
import {
  MonthDaysResponseSchema,
  MonthFilterSchema,
  MonthResponseSchema,
  MonthRowSchema,
  MonthSummarySchema,
  compareMonthRows,
  emptyMonthSummary,
  type MonthRow,
} from "./scheduling";

const uuid = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("MonthFilterSchema", () => {
  it("requires month YYYY-MM and accepts optional area/employee", () => {
    expect(MonthFilterSchema.parse({ month: "2026-11" })).toEqual({
      month: "2026-11",
    });
    expect(
      MonthFilterSchema.parse({
        month: "2026-11",
        areaId: uuid,
        employeeId: uuid2,
      }),
    ).toEqual({
      month: "2026-11",
      areaId: uuid,
      employeeId: uuid2,
    });
  });

  it("rejects invalid month and non-uuid filters", () => {
    expect(() => MonthFilterSchema.parse({ month: "2026-13" })).toThrow();
    expect(() => MonthFilterSchema.parse({ month: "2026-1" })).toThrow();
    expect(() =>
      MonthFilterSchema.parse({ month: "2026-11", areaId: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("MonthRowSchema / MonthSummarySchema", () => {
  const row: MonthRow = {
    siteId: uuid,
    siteName: "Обект 1",
    clientName: "Клиент",
    areaId: uuid2,
    areaName: "Център",
    status: ScheduleStatus.UPCOMING,
    lastVisitDate: null,
    nextDueMonth: "2026-11",
    monthsOverdue: 0,
    employees: [],
  };

  it("accepts a valid MonthRow including empty employees", () => {
    expect(MonthRowSchema.parse(row)).toEqual(row);
  });

  it("accepts LEAD-first employees and SERVICED with lastVisitDate", () => {
    const serviced = MonthRowSchema.parse({
      ...row,
      status: ScheduleStatus.SERVICED,
      lastVisitDate: "2026-11-05",
      nextDueMonth: "2026-12",
      employees: [
        { userId: uuid, fullName: "Lead", role: "LEAD" },
        { userId: uuid2, fullName: "Assist", role: "ASSIST" },
      ],
    });
    expect(serviced.employees[0]?.role).toBe("LEAD");
  });

  it("builds empty summary with zero counts and withoutSubscription", () => {
    const summary = emptyMonthSummary("2026-11");
    expect(MonthSummarySchema.parse(summary)).toEqual(summary);
    expect(summary.withoutSubscription).toBe(0);
    expect(summary.counts[ScheduleStatus.OVERDUE]).toBe(0);
  });

  it("parses MonthResponse and MonthDaysResponse shapes", () => {
    const response = MonthResponseSchema.parse({
      rows: [row],
      summary: emptyMonthSummary("2026-11"),
      month: "2026-11",
      filter: { month: "2026-11" },
      page: 1,
      pageSize: 20,
      total: 1,
    });
    expect(response.rows).toHaveLength(1);

    const days = MonthDaysResponseSchema.parse({
      month: "2026-11",
      filter: { month: "2026-11" },
      days: [
        {
          date: "2026-11-01",
          servicedSiteIds: [],
          dueSiteIds: [uuid],
          overdueSiteIds: [],
        },
      ],
    });
    expect(days.days[0]?.date).toBe("2026-11-01");
  });
});

describe("compareMonthRows", () => {
  it("orders by status priority then overdue months then name", () => {
    const base = {
      siteId: uuid,
      clientName: "К",
      areaId: uuid2,
      areaName: "А",
      lastVisitDate: null,
      nextDueMonth: null,
      employees: [],
    };
    const overdue2: MonthRow = {
      ...base,
      siteName: "B",
      status: ScheduleStatus.OVERDUE,
      monthsOverdue: 2,
    };
    const overdue1: MonthRow = {
      ...base,
      siteName: "A",
      status: ScheduleStatus.OVERDUE,
      monthsOverdue: 1,
    };
    const upcoming: MonthRow = {
      ...base,
      siteName: "C",
      status: ScheduleStatus.UPCOMING,
      monthsOverdue: 0,
      nextDueMonth: "2026-11",
    };
    const sorted = [upcoming, overdue1, overdue2].sort(compareMonthRows);
    expect(sorted.map((r) => r.siteName)).toEqual(["B", "A", "C"]);
  });
});
