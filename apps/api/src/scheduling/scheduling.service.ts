import { Inject, Injectable } from "@nestjs/common";
import {
  compareMonthRows,
  computeScheduleStatus,
  defineAbilityFor,
  emptyMonthSummary,
  EmployeeRoleOnVisit,
  firstDayOfMonth,
  lastDayOfMonth,
  monthOf,
  ScheduleStatus,
  SiteStatus,
  todayInSofia,
  VisitStatus,
  type MonthDaysQuery,
  type MonthDaysResponse,
  type MonthEmployee,
  type MonthFilter,
  type MonthListQuery,
  type MonthResponse,
  type MonthRow,
  type MonthSummary,
  type ScheduleStatus as ScheduleStatusType,
  type SubscriptionFrequency,
} from "@ddcrm/shared";
import { accessibleSchedulingWhere } from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate } from "../common/date-string";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type SubRow = {
  id: string;
  frequency: SubscriptionFrequency;
  startDate: Date;
  endDate: Date | null;
};

type VisitEmpRow = {
  userId: string;
  roleOnVisit: string;
  user: { id: string; name: string };
};

type VisitRow = {
  id: string;
  visitDate: Date;
  status: string;
  createdById: string;
  employees: VisitEmpRow[];
};

type SiteRow = {
  id: string;
  name: string;
  areaId: string;
  client: { name: string };
  area: { id: string; name: string };
  subscriptions: SubRow[];
  visits: VisitRow[];
};

type BuiltSite = {
  row: MonthRow;
  visitDatesThisMonth: string[];
  withoutSubscription: boolean;
};

/**
 * Fixed clock for tests: set `SCHEDULING_FIXED_NOW` to an ISO timestamp
 * (e.g. `2026-11-15T12:00:00.000Z`). Production leaves it unset.
 */
function clockNow(): Date {
  const fixed = process.env.SCHEDULING_FIXED_NOW;
  if (fixed) return new Date(fixed);
  return new Date();
}

/** Clamp "today" into the viewed month so status matches that month window. */
export function asOfForMonth(month: string, now: Date): string {
  const today = todayInSofia(now);
  const first = firstDayOfMonth(month);
  const last = lastDayOfMonth(month);
  if (today < first) return first;
  if (today > last) return last;
  return today;
}

function pickSubscription(subs: SubRow[], asOf: string, month: string): SubRow | null {
  if (subs.length === 0) return null;
  const first = firstDayOfMonth(month);
  const last = lastDayOfMonth(month);
  const asOfDate = asOf;

  const byStart = [...subs].sort((a, b) =>
    dateToIsoDate(a.startDate).localeCompare(dateToIsoDate(b.startDate)),
  );

  // Overlaps the month window [first, last].
  const overlapping = byStart.filter((s) => {
    const start = dateToIsoDate(s.startDate);
    const end = s.endDate ? dateToIsoDate(s.endDate) : null;
    return start <= last && (end === null || end >= first);
  });
  if (overlapping.length > 0) {
    const covering = overlapping.find((s) => {
      const start = dateToIsoDate(s.startDate);
      const end = s.endDate ? dateToIsoDate(s.endDate) : null;
      return start <= asOfDate && (end === null || end >= asOfDate);
    });
    return covering ?? overlapping[overlapping.length - 1]!;
  }

  // Future start → NOT_STARTED
  const future = byStart.filter((s) => monthOf(dateToIsoDate(s.startDate)) > month);
  if (future.length > 0) return future[0]!;

  // Ended before the month → ENDED
  const past = byStart
    .filter((s) => s.endDate !== null && dateToIsoDate(s.endDate) < first)
    .sort((a, b) =>
      dateToIsoDate(b.endDate!).localeCompare(dateToIsoDate(a.endDate!)),
    );
  if (past.length > 0) return past[0]!;

  return null;
}

function employeesThisMonth(visits: VisitRow[], first: string, last: string): MonthEmployee[] {
  const byUser = new Map<string, MonthEmployee>();
  const inMonth = visits
    .filter((v) => v.status === VisitStatus.ACTIVE)
    .filter((v) => {
      const d = dateToIsoDate(v.visitDate);
      return d >= first && d <= last;
    })
    .sort((a, b) => dateToIsoDate(b.visitDate).localeCompare(dateToIsoDate(a.visitDate)));

  for (const visit of inMonth) {
    for (const emp of visit.employees) {
      const existing = byUser.get(emp.userId);
      const next: MonthEmployee = {
        userId: emp.userId,
        fullName: emp.user.name,
        role:
          emp.roleOnVisit === EmployeeRoleOnVisit.LEAD
            ? EmployeeRoleOnVisit.LEAD
            : EmployeeRoleOnVisit.ASSIST,
      };
      if (!existing) {
        byUser.set(emp.userId, next);
      } else if (
        existing.role !== EmployeeRoleOnVisit.LEAD &&
        next.role === EmployeeRoleOnVisit.LEAD
      ) {
        byUser.set(emp.userId, next);
      }
    }
  }

  return [...byUser.values()].sort((a, b) => {
    if (a.role === b.role) return a.fullName.localeCompare(b.fullName, "bg");
    return a.role === EmployeeRoleOnVisit.LEAD ? -1 : 1;
  });
}

/**
 * Employee filter (D3): match LEAD of most recent ACTIVE visit this month;
 * else created_by of most recent ACTIVE visit ever. ASSIST-only does not match.
 */
function matchesEmployeeFilter(
  visits: VisitRow[],
  employeeId: string,
  first: string,
  last: string,
): boolean {
  const active = visits
    .filter((v) => v.status === VisitStatus.ACTIVE)
    .sort((a, b) => dateToIsoDate(b.visitDate).localeCompare(dateToIsoDate(a.visitDate)));

  const thisMonth = active.filter((v) => {
    const d = dateToIsoDate(v.visitDate);
    return d >= first && d <= last;
  });

  if (thisMonth.length > 0) {
    const latest = thisMonth[0]!;
    const lead = latest.employees.find(
      (e) => e.roleOnVisit === EmployeeRoleOnVisit.LEAD,
    );
    return lead?.userId === employeeId;
  }

  if (active.length === 0) return false;
  return active[0]!.createdById === employeeId;
}

@Injectable()
export class SchedulingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private async loadSites(
    user: AuthRequestUser,
    filter: MonthFilter,
  ): Promise<SiteRow[]> {
    const ability = this.abilityFor(user);
    const scope = accessibleSchedulingWhere(ability);
    const where: Prisma.SiteWhereInput = {
      AND: [scope, { status: SiteStatus.ACTIVE }],
    };
    if (filter.areaId) {
      (where.AND as Prisma.SiteWhereInput[]).push({ areaId: filter.areaId });
    }

    return this.prisma.site.findMany({
      where,
      select: {
        id: true,
        name: true,
        areaId: true,
        client: { select: { name: true } },
        area: { select: { id: true, name: true } },
        subscriptions: {
          select: {
            id: true,
            frequency: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { startDate: "asc" },
        },
        visits: {
          where: { status: VisitStatus.ACTIVE },
          select: {
            id: true,
            visitDate: true,
            status: true,
            createdById: true,
            employees: {
              select: {
                userId: true,
                roleOnVisit: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { visitDate: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }) as Promise<SiteRow[]>;
  }

  private buildSites(
    sites: SiteRow[],
    filter: MonthFilter,
    now: Date,
  ): { rows: MonthRow[]; summary: MonthSummary; built: BuiltSite[] } {
    const month = filter.month;
    const first = firstDayOfMonth(month);
    const last = lastDayOfMonth(month);
    const asOf = asOfForMonth(month, now);
    const summary = emptyMonthSummary(month);
    const built: BuiltSite[] = [];

    for (const site of sites) {
      const sub = pickSubscription(site.subscriptions, asOf, month);
      if (!sub) {
        summary.withoutSubscription += 1;
        built.push({
          row: {
            siteId: site.id,
            siteName: site.name,
            clientName: site.client.name,
            areaId: site.area.id,
            areaName: site.area.name,
            status: ScheduleStatus.NOT_DUE,
            lastVisitDate: null,
            nextDueMonth: null,
            monthsOverdue: 0,
            employees: [],
          },
          visitDatesThisMonth: [],
          withoutSubscription: true,
        });
        continue;
      }

      const activeVisitDates = site.visits
        .filter((v) => v.status === VisitStatus.ACTIVE)
        .map((v) => dateToIsoDate(v.visitDate));

      const computed = computeScheduleStatus({
        frequency: sub.frequency,
        startDate: dateToIsoDate(sub.startDate),
        endDate: sub.endDate ? dateToIsoDate(sub.endDate) : null,
        doneVisitDates: activeVisitDates,
        asOf,
      });

      const employees = employeesThisMonth(site.visits, first, last);
      const visitDatesThisMonth = activeVisitDates.filter((d) => d >= first && d <= last);

      const row: MonthRow = {
        siteId: site.id,
        siteName: site.name,
        clientName: site.client.name,
        areaId: site.area.id,
        areaName: site.area.name,
        status: computed.status,
        lastVisitDate: computed.lastVisitDate,
        nextDueMonth: computed.nextDueMonth,
        monthsOverdue: computed.monthsOverdue,
        employees,
      };

      built.push({ row, visitDatesThisMonth, withoutSubscription: false });
    }

    // withoutSubscription: area/scope only (data-quality signal), before employee filter.
    summary.withoutSubscription = built.filter((b) => b.withoutSubscription).length;

    let withSub = built.filter((b) => !b.withoutSubscription);

    if (filter.employeeId) {
      const employeeId = filter.employeeId;
      withSub = withSub.filter((b) => {
        const site = sites.find((s) => s.id === b.row.siteId)!;
        return matchesEmployeeFilter(site.visits, employeeId, first, last);
      });
    }

    for (const b of withSub) {
      summary.counts[b.row.status as ScheduleStatusType] += 1;
    }
    summary.totalSites = withSub.length;

    const rows = withSub.map((b) => b.row).sort(compareMonthRows);
    return { rows, summary, built: withSub };
  }

  async getMonth(user: AuthRequestUser, query: MonthListQuery): Promise<MonthResponse> {
    const filter: MonthFilter = {
      month: query.month,
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    const now = clockNow();
    const sites = await this.loadSites(user, filter);
    const { rows, summary } = this.buildSites(sites, filter, now);

    // Coerce: query strings can arrive unparsed when design:paramtypes
    // metadata is missing (e.g. plain tsx). ZodValidationPipe normally
    // coerces; Number() keeps the response schema honest either way.
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    return {
      rows: pageRows,
      summary,
      month: filter.month,
      filter,
      page,
      pageSize,
      total: rows.length,
    };
  }

  async getMonthDays(
    user: AuthRequestUser,
    query: MonthDaysQuery,
  ): Promise<MonthDaysResponse> {
    const filter: MonthFilter = {
      month: query.month,
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    const now = clockNow();
    const sites = await this.loadSites(user, filter);
    const { built } = this.buildSites(sites, filter, now);

    const first = firstDayOfMonth(filter.month);
    const last = lastDayOfMonth(filter.month);
    const [y, m] = filter.month.split("-").map(Number) as [number, number];
    const dayCount = Number(last.slice(8, 10));

    const dueIds = built
      .filter((b) => b.row.status === ScheduleStatus.UPCOMING)
      .map((b) => b.row.siteId);
    const overdueIds = built
      .filter((b) => b.row.status === ScheduleStatus.OVERDUE)
      .map((b) => b.row.siteId);

    const servicedByDay = new Map<string, string[]>();
    for (const b of built) {
      if (b.row.status !== ScheduleStatus.SERVICED) continue;
      for (const d of b.visitDatesThisMonth) {
        const list = servicedByDay.get(d) ?? [];
        list.push(b.row.siteId);
        servicedByDay.set(d, list);
      }
    }

    const days = [];
    for (let day = 1; day <= dayCount; day++) {
      const date = `${filter.month}-${String(day).padStart(2, "0")}`;
      // Validate calendar day exists (lastDay already caps dayCount).
      void y;
      void m;
      void first;
      days.push({
        date,
        servicedSiteIds: [...new Set(servicedByDay.get(date) ?? [])],
        dueSiteIds: [...dueIds],
        overdueSiteIds: [...overdueIds],
      });
    }

    return { days, month: filter.month, filter };
  }
}
