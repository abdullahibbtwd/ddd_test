import { z } from "zod";
import {
  addMonths,
  firstDayOfMonth,
  frequencyMonths,
  monthDiff,
  monthOf,
} from "./dates";
import {
  SubscriptionFrequency,
  SubscriptionFrequencySchema,
} from "./subscription-frequency";

export const ScheduleStatus = {
  NOT_STARTED: "NOT_STARTED",
  ENDED: "ENDED",
  ON_DEMAND: "ON_DEMAND",
  SERVICED: "SERVICED",
  UPCOMING: "UPCOMING",
  OVERDUE: "OVERDUE",
  NOT_DUE: "NOT_DUE",
} as const;

export const ScheduleStatusSchema = z.enum([
  ScheduleStatus.NOT_STARTED,
  ScheduleStatus.ENDED,
  ScheduleStatus.ON_DEMAND,
  ScheduleStatus.SERVICED,
  ScheduleStatus.UPCOMING,
  ScheduleStatus.OVERDUE,
  ScheduleStatus.NOT_DUE,
]);

export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

export type ComputeScheduleStatusInput = {
  frequency: SubscriptionFrequency;
  startDate: string;
  endDate: string | null;
  doneVisitDates: string[];
  asOf: string;
};

export type ComputeScheduleStatusResult = {
  status: ScheduleStatus;
  lastVisitDate: string | null;
  nextDueMonth: string | null;
  monthsOverdue: number;
};

export function computeScheduleStatus(
  input: ComputeScheduleStatusInput,
): ComputeScheduleStatusResult {
  const { frequency, startDate, endDate, doneVisitDates, asOf } = input;
  SubscriptionFrequencySchema.parse(frequency);

  const M = monthOf(asOf);

  // 1. Not started yet
  if (monthOf(startDate) > M) {
    return {
      status: ScheduleStatus.NOT_STARTED,
      lastVisitDate: null,
      nextDueMonth: null,
      monthsOverdue: 0,
    };
  }

  // 2. Ended before the start of month M
  if (endDate !== null && endDate < firstDayOfMonth(M)) {
    return {
      status: ScheduleStatus.ENDED,
      lastVisitDate: null,
      nextDueMonth: null,
      monthsOverdue: 0,
    };
  }

  // 3. Considered visits
  const considered = doneVisitDates.filter((d) => {
    if (d < startDate || d > asOf) return false;
    if (endDate !== null && d > endDate) return false;
    return true;
  });
  const lastVisitDate =
    considered.length === 0
      ? null
      : considered.reduce((a, b) => (a > b ? a : b));

  // 4. On demand
  if (frequency === SubscriptionFrequency.ON_DEMAND) {
    return {
      status: ScheduleStatus.ON_DEMAND,
      lastVisitDate,
      nextDueMonth: null,
      monthsOverdue: 0,
    };
  }

  const k = frequencyMonths(frequency);
  if (k === null) {
    throw new Error(`Unexpected null interval for ${frequency}`);
  }

  // 5. Serviced this month
  if (lastVisitDate !== null && monthOf(lastVisitDate) === M) {
    return {
      status: ScheduleStatus.SERVICED,
      lastVisitDate,
      nextDueMonth: addMonths(monthOf(lastVisitDate), k),
      monthsOverdue: 0,
    };
  }

  // 6. Rolling next due
  const nextDue =
    lastVisitDate !== null
      ? addMonths(monthOf(lastVisitDate), k)
      : monthOf(startDate);

  if (nextDue < M) {
    return {
      status: ScheduleStatus.OVERDUE,
      lastVisitDate,
      nextDueMonth: nextDue,
      monthsOverdue: monthDiff(M, nextDue),
    };
  }
  if (nextDue === M) {
    return {
      status: ScheduleStatus.UPCOMING,
      lastVisitDate,
      nextDueMonth: nextDue,
      monthsOverdue: 0,
    };
  }
  return {
    status: ScheduleStatus.NOT_DUE,
    lastVisitDate,
    nextDueMonth: nextDue,
    monthsOverdue: 0,
  };
}
