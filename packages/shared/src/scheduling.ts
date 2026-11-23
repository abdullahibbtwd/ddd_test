import { z } from "zod";
import { EmployeeRoleOnVisitSchema } from "./employee-role-on-visit";
import { PageQuerySchema } from "./page-query";
import { ScheduleStatus, ScheduleStatusSchema } from "./schedule-status";

const monthString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month (YYYY-MM)");

const optionalUuid = z.uuid().optional();

/** Shared filter for list, summary, and calendar. Pure. */
export const MonthFilterSchema = z.object({
  month: monthString,
  areaId: optionalUuid,
  employeeId: optionalUuid,
});

export type MonthFilter = z.infer<typeof MonthFilterSchema>;

export const MonthListQuerySchema = PageQuerySchema.pick({
  page: true,
  pageSize: true,
}).extend({
  month: monthString,
  areaId: optionalUuid,
  employeeId: optionalUuid,
});

export type MonthListQuery = z.infer<typeof MonthListQuerySchema>;

export const MonthDaysQuerySchema = MonthFilterSchema;

export type MonthDaysQuery = z.infer<typeof MonthDaysQuerySchema>;

export const MonthEmployeeSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  role: EmployeeRoleOnVisitSchema,
});

export type MonthEmployee = z.infer<typeof MonthEmployeeSchema>;

export const MonthRowSchema = z.object({
  siteId: z.uuid(),
  siteName: z.string(),
  clientName: z.string(),
  areaId: z.uuid(),
  areaName: z.string(),
  status: ScheduleStatusSchema,
  lastVisitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  nextDueMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  monthsOverdue: z.number().int().nonnegative(),
  employees: z.array(MonthEmployeeSchema),
});

export type MonthRow = z.infer<typeof MonthRowSchema>;

const emptyCounts = (): Record<ScheduleStatus, number> => ({
  [ScheduleStatus.NOT_STARTED]: 0,
  [ScheduleStatus.ENDED]: 0,
  [ScheduleStatus.ON_DEMAND]: 0,
  [ScheduleStatus.SERVICED]: 0,
  [ScheduleStatus.UPCOMING]: 0,
  [ScheduleStatus.OVERDUE]: 0,
  [ScheduleStatus.NOT_DUE]: 0,
});

export const MonthSummarySchema = z.object({
  counts: z.object({
    [ScheduleStatus.NOT_STARTED]: z.number().int().nonnegative(),
    [ScheduleStatus.ENDED]: z.number().int().nonnegative(),
    [ScheduleStatus.ON_DEMAND]: z.number().int().nonnegative(),
    [ScheduleStatus.SERVICED]: z.number().int().nonnegative(),
    [ScheduleStatus.UPCOMING]: z.number().int().nonnegative(),
    [ScheduleStatus.OVERDUE]: z.number().int().nonnegative(),
    [ScheduleStatus.NOT_DUE]: z.number().int().nonnegative(),
  }),
  totalSites: z.number().int().nonnegative(),
  withoutSubscription: z.number().int().nonnegative(),
  month: monthString,
});

export type MonthSummary = z.infer<typeof MonthSummarySchema>;

export function emptyMonthSummary(month: string): MonthSummary {
  return {
    counts: emptyCounts(),
    totalSites: 0,
    withoutSubscription: 0,
    month,
  };
}

export const MonthResponseSchema = z.object({
  rows: z.array(MonthRowSchema),
  summary: MonthSummarySchema,
  month: monthString,
  filter: MonthFilterSchema,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type MonthResponse = z.infer<typeof MonthResponseSchema>;

export const MonthDayBucketSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servicedSiteIds: z.array(z.uuid()),
  dueSiteIds: z.array(z.uuid()),
  overdueSiteIds: z.array(z.uuid()),
});

export type MonthDayBucket = z.infer<typeof MonthDayBucketSchema>;

export const MonthDaysResponseSchema = z.object({
  days: z.array(MonthDayBucketSchema),
  month: monthString,
  filter: MonthFilterSchema,
});

export type MonthDaysResponse = z.infer<typeof MonthDaysResponseSchema>;

/**
 * Sort priority for "This Month" list: operational urgency first,
 * then overdue depth, then site name.
 */
export const SCHEDULE_STATUS_SORT_ORDER: Record<ScheduleStatus, number> = {
  [ScheduleStatus.OVERDUE]: 0,
  [ScheduleStatus.UPCOMING]: 1,
  [ScheduleStatus.SERVICED]: 2,
  [ScheduleStatus.NOT_STARTED]: 3,
  [ScheduleStatus.ON_DEMAND]: 4,
  [ScheduleStatus.ENDED]: 5,
  [ScheduleStatus.NOT_DUE]: 6,
};

export function compareMonthRows(a: MonthRow, b: MonthRow): number {
  const byStatus =
    SCHEDULE_STATUS_SORT_ORDER[a.status] - SCHEDULE_STATUS_SORT_ORDER[b.status];
  if (byStatus !== 0) return byStatus;
  if (a.monthsOverdue !== b.monthsOverdue) {
    return b.monthsOverdue - a.monthsOverdue;
  }
  return a.siteName.localeCompare(b.siteName, "bg");
}
