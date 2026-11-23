import {
  Role,
  ScheduleStatus,
  todayInSofia,
  type MonthDayBucket,
  type MonthRow,
  type MonthSummary,
  type ScheduleStatus as ScheduleStatusType,
} from "@ddcrm/shared";
import { Link, createFileRoute, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAreasControllerList } from "@/api/generated/areas/areas";
import {
  useSchedulingControllerGetMonth,
  useSchedulingControllerGetMonthDays,
} from "@/api/generated/scheduling/scheduling";
import { useUsersControllerList } from "@/api/generated/users/users";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const TILE_STATUSES = [
  ScheduleStatus.SERVICED,
  ScheduleStatus.UPCOMING,
  ScheduleStatus.OVERDUE,
  ScheduleStatus.NOT_STARTED,
  ScheduleStatus.ENDED,
  ScheduleStatus.ON_DEMAND,
] as const;

type MonthSearch = {
  month?: string;
  areaId?: string;
  employeeId?: string;
  tab?: "list" | "calendar";
  page?: number;
};

function defaultMonth(): string {
  return todayInSofia(new Date()).slice(0, 7);
}

export const Route = createFileRoute("/_shell/month")({
  validateSearch: (search: Record<string, unknown>): MonthSearch => ({
    month: typeof search.month === "string" ? search.month : undefined,
    areaId: typeof search.areaId === "string" ? search.areaId : undefined,
    employeeId: typeof search.employeeId === "string" ? search.employeeId : undefined,
    tab: search.tab === "calendar" ? "calendar" : search.tab === "list" ? "list" : undefined,
    page: typeof search.page === "number" ? search.page : undefined,
  }),
  component: MonthPage,
});

export function statusBadgeVariant(status: ScheduleStatusType): StatusVariant {
  switch (status) {
    case ScheduleStatus.SERVICED:
      return "ok";
    case ScheduleStatus.UPCOMING:
      return "warn";
    case ScheduleStatus.OVERDUE:
      return "bad";
    default:
      return "neutral";
  }
}

function MonthPage() {
  const { t } = useTranslation("month");
  const { user } = useRouteContext({ from: "/_shell" });
  const navigate = useNavigate({ from: "/month" });
  const search = Route.useSearch();

  const isField = user.role === Role.FIELD;
  const showEmployee = user.role === Role.ADMIN || user.role === Role.OFFICE;

  const month = search.month ?? defaultMonth();
  const areaId = search.areaId ?? "";
  const employeeId = search.employeeId ?? "";
  const tab = search.tab ?? "list";
  const page = search.page ?? 1;

  const [dayDrawer, setDayDrawer] = useState<MonthDayBucket | null>(null);

  const filterParams = useMemo(
    () => ({
      month,
      ...(areaId ? { areaId } : {}),
      ...(employeeId ? { employeeId } : {}),
    }),
    [month, areaId, employeeId],
  );

  const listQuery = useSchedulingControllerGetMonth({
    ...filterParams,
    page,
    pageSize: PAGE_SIZE,
  });

  const daysQuery = useSchedulingControllerGetMonthDays(filterParams, {
    query: { enabled: tab === "calendar" },
  });

  const areasQuery = useAreasControllerList(
    { pageSize: 100 },
    { query: { enabled: !isField } },
  );
  const usersQuery = useUsersControllerList(
    { pageSize: 100, role: Role.FIELD },
    { query: { enabled: showEmployee } },
  );

  const summary: MonthSummary | undefined = listQuery.data?.data?.summary;
  const rows: MonthRow[] = listQuery.data?.data?.rows ?? [];
  const total = listQuery.data?.data?.total ?? 0;
  const days: MonthDayBucket[] = daysQuery.data?.data?.days ?? [];

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.siteId, row.siteName);
    // Days may reference sites not on the current list page — fill from days query
    // by using list page 1..n is heavy; for drawer we refetch names from a full list
    // via the month endpoint without pagination when opening a day.
    return map;
  }, [rows]);

  const allRowsQuery = useSchedulingControllerGetMonth(
    { ...filterParams, page: 1, pageSize: 100 },
    { query: { enabled: dayDrawer !== null || tab === "calendar" } },
  );
  const allSiteNames = useMemo(() => {
    const map = new Map(siteNameById);
    for (const row of allRowsQuery.data?.data?.rows ?? []) {
      map.set(row.siteId, row.siteName);
    }
    return map;
  }, [siteNameById, allRowsQuery.data]);

  function patchSearch(next: Partial<MonthSearch>) {
    void navigate({
      search: (prev) => ({
        ...prev,
        ...next,
        month: next.month ?? prev.month ?? month,
      }),
    });
  }

  function openSite(siteId: string) {
    void navigate({
      to: "/sites",
      search: { siteId, tab: "visits" },
    });
  }

  const areas = areasQuery.data?.data?.items ?? [];
  const employees = usersQuery.data?.data?.items ?? [];

  return (
    <div data-testid="month-page">
      <PageHeader title={t("title")} description={t("description")} />

      <FilterBar className="flex-wrap" data-testid="month-filters">
        <div className="space-y-1.5">
          <Label htmlFor="month-picker">{t("filters.month")}</Label>
          <Input
            id="month-picker"
            data-testid="month-picker"
            type="month"
            value={month}
            onChange={(e) => patchSearch({ month: e.target.value, page: 1 })}
          />
        </div>
        {!isField ? (
          <div className="space-y-1.5" data-testid="month-area-filter">
            <Label>{t("filters.area")}</Label>
            <Select
              value={areaId || "__all__"}
              onValueChange={(v) =>
                patchSearch({ areaId: v === "__all__" ? undefined : v, page: 1 })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("filters.areaAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("filters.areaAll")}</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {showEmployee ? (
          <div className="space-y-1.5" data-testid="month-employee-filter">
            <Label>{t("filters.employee")}</Label>
            <Select
              value={employeeId || "__all__"}
              onValueChange={(v) =>
                patchSearch({
                  employeeId: v === "__all__" ? undefined : v,
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t("filters.employeeAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("filters.employeeAll")}</SelectItem>
                {employees.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </FilterBar>

      <div
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        data-testid="month-summary"
      >
        {TILE_STATUSES.map((status) => (
          <div
            key={status}
            data-testid={`month-tile-${status}`}
            className="border-b border-border pb-2"
          >
            <div className="label text-ink-muted">{t(`tiles.${status}`)}</div>
            <div className="num mt-1 text-2xl font-semibold tabular-nums">
              {summary?.counts[status] ?? "—"}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-muted" data-testid="month-without-sub">
        <Link
          to="/sites"
          search={{ hasSubscription: false }}
          className="underline-offset-2 hover:underline"
        >
          {t("tiles.withoutSubscription", {
            count: summary?.withoutSubscription ?? 0,
          })}
        </Link>
      </p>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          patchSearch({ tab: v === "calendar" ? "calendar" : "list" })
        }
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="list" data-testid="month-tab-list">
            {t("tabs.list")}
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="month-tab-calendar">
            {t("tabs.calendar")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {rows.length === 0 && !listQuery.isLoading ? (
            <div data-testid="month-empty">
              <EmptyState message={t("empty")} />
            </div>
          ) : (
            <>
              <div data-testid="month-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.site")}</TableHead>
                    <TableHead>{t("columns.client")}</TableHead>
                    <TableHead>{t("columns.area")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead>{t("columns.lastVisit")}</TableHead>
                    <TableHead>{t("columns.nextDue")}</TableHead>
                    <TableHead>{t("columns.employees")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.siteId}
                      className="cursor-pointer"
                      data-testid={`month-row-${row.siteId}`}
                      onClick={() => openSite(row.siteId)}
                    >
                      <TableCell>{row.siteName}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>{row.areaName}</TableCell>
                      <TableCell>
                        <StatusBadge variant={statusBadgeVariant(row.status)}>
                          {t(`status.${row.status}`)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="num">
                        {row.lastVisitDate ?? t("emDash")}
                      </TableCell>
                      <TableCell className="num">
                        {row.nextDueMonth ?? t("emDash")}
                      </TableCell>
                      <TableCell>
                        {row.employees.length === 0
                          ? t("emDash")
                          : row.employees.map((e) => e.fullName).join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={(p) => patchSearch({ page: p })}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <MonthCalendar
            month={month}
            days={days}
            onDayClick={setDayDrawer}
          />
        </TabsContent>
      </Tabs>

      <Drawer
        open={dayDrawer !== null}
        onOpenChange={(open) => {
          if (!open) setDayDrawer(null);
        }}
        title={
          dayDrawer
            ? t("calendar.dayTitle", { date: dayDrawer.date })
            : t("tabs.calendar")
        }
      >
        {dayDrawer ? (
          <DayDrawerBody
            day={dayDrawer}
            names={allSiteNames}
            onOpenSite={(id) => {
              setDayDrawer(null);
              openSite(id);
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function DayDrawerBody({
  day,
  names,
  onOpenSite,
}: {
  day: MonthDayBucket;
  names: Map<string, string>;
  onOpenSite: (siteId: string) => void;
}) {
  const { t } = useTranslation("month");
  const sections = [
    { key: "serviced" as const, ids: day.servicedSiteIds },
    { key: "due" as const, ids: day.dueSiteIds },
    { key: "overdue" as const, ids: day.overdueSiteIds },
  ];
  const any = sections.some((s) => s.ids.length > 0);
  if (!any) {
    return <p className="text-sm text-ink-muted">{t("calendar.emptyDay")}</p>;
  }
  return (
    <div className="space-y-6" data-testid="month-day-drawer">
      {sections.map((section) =>
        section.ids.length === 0 ? null : (
          <section key={section.key}>
            <h3 className="label text-ink-muted">{t(`calendar.${section.key}`)}</h3>
            <ul className="mt-2 space-y-1">
              {section.ids.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className="text-left text-sm text-ink underline-offset-2 hover:underline"
                    onClick={() => onOpenSite(id)}
                  >
                    {names.get(id) ?? id}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

export function MonthCalendar({
  month,
  days,
  onDayClick,
}: {
  month: string;
  days: MonthDayBucket[];
  onDayClick: (day: MonthDayBucket) => void;
}) {
  const { t } = useTranslation("month");
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  // Monday-first
  const offset = (firstWeekday + 6) % 7;

  return (
    <div className="mt-2">
      {/* Desktop / tablet: month grid */}
      <div
        className="hidden grid-cols-7 gap-px border border-border bg-border sm:grid"
        data-testid="month-calendar-grid"
      >
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-20 bg-surface p-2" />
        ))}
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            data-testid={`month-day-${day.date}`}
            className="min-h-20 bg-surface p-2 text-left hover:bg-surface-muted"
            onClick={() => onDayClick(day)}
          >
            <div className="num text-sm font-medium">{Number(day.date.slice(8))}</div>
            <div className="mt-2 flex gap-1">
              {day.servicedSiteIds.length > 0 ? (
                <span className="size-1.5 rounded-full bg-ok-ink" title={t("calendar.serviced")} />
              ) : null}
              {day.dueSiteIds.length > 0 ? (
                <span className="size-1.5 rounded-full bg-warn-ink" title={t("calendar.due")} />
              ) : null}
              {day.overdueSiteIds.length > 0 ? (
                <span className="size-1.5 rounded-full bg-bad-ink" title={t("calendar.overdue")} />
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {/* Phone: vertical week list */}
      <div
        className="space-y-2 sm:hidden"
        data-testid="month-calendar-weeklist"
        aria-label={t("calendar.weekList")}
      >
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            data-testid={`month-day-mobile-${day.date}`}
            className={cn(
              "flex w-full items-center justify-between border-b border-border px-1 py-3 text-left",
            )}
            onClick={() => onDayClick(day)}
          >
            <span className="num text-sm font-medium">{day.date}</span>
            <span className="flex gap-1">
              {day.servicedSiteIds.length > 0 ? (
                <span className="size-2 rounded-full bg-ok-ink" />
              ) : null}
              {day.dueSiteIds.length > 0 ? (
                <span className="size-2 rounded-full bg-warn-ink" />
              ) : null}
              {day.overdueSiteIds.length > 0 ? (
                <span className="size-2 rounded-full bg-bad-ink" />
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
