import {
  ReportKind,
  Role,
  ScheduleStatus,
  todayInSofia,
  type ScheduleStatus as ScheduleStatusT,
} from "@ddcrm/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  Award,
  Bell,
  FileSignature,
  FileText,
  FlaskConical,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgreementsControllerExpiring } from "@/api/generated/agreements/agreements";
import { useAuditControllerList } from "@/api/generated/audit-log/audit-log";
import { useFoodSchedulesControllerDue } from "@/api/generated/food-schedules/food-schedules";
import { useHealthControllerGetReadiness } from "@/api/generated/health/health";
import { useHealthCertificatesControllerExpiring } from "@/api/generated/health-certificates/health-certificates";
import { useNotificationsControllerMe } from "@/api/generated/notifications/notifications";
import {
  useCashLedgerControllerCashLedger,
  useInvoicePaymentsControllerOutstanding,
} from "@/api/generated/payments/payments";
import { useSchedulingControllerGetMonth } from "@/api/generated/scheduling/scheduling";
import { apiFetch } from "@/api/mutator";
import { AgingBar } from "@/components/dashboard/aging-bar";
import { AuditFeed } from "@/components/dashboard/audit-feed";
import {
  CashEmployeesList,
  CashPositionStrip,
} from "@/components/dashboard/cash-position";
import {
  FieldBanner,
  FieldNotifications,
  FieldSitesByArea,
} from "@/components/dashboard/field-today";
import { KpiGrid, KpiTile } from "@/components/dashboard/kpi-tile";
import { SchedulePulse } from "@/components/dashboard/schedule-pulse";
import { SystemHealthPanel } from "@/components/dashboard/system-health";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { emptyMonthSummary } from "@ddcrm/shared";
import { notificationCopy } from "@/lib/relative-time";

type OutstandingReport = {
  totals: {
    outstanding: string;
    "0_30": string;
    "31_60": string;
    "61_90": string;
    "90_plus": string;
  };
  items: Array<{ agingBucket: string | null }>;
};

function currentMonth(): string {
  return todayInSofia(new Date()).slice(0, 7);
}

function asNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function DashboardPage() {
  const { user } = useRouteContext({ from: "/_shell" });
  if (user.role === Role.FIELD) return <FieldDashboard />;
  if (user.role === Role.OFFICE) return <OfficeDashboard />;
  return <AdminDashboard />;
}

function useDashboardSharedQueries(opts?: {
  employeeId?: string;
  includeAudit?: boolean;
  includeHealth?: boolean;
  /** OFFICE/ADMIN financial & compliance widgets. */
  includeOfficeWidgets?: boolean;
}) {
  const month = currentMonth();
  const asOf = todayInSofia(new Date());
  const office = opts?.includeOfficeWidgets === true;

  const monthQuery = useSchedulingControllerGetMonth({
    month,
    page: 1,
    pageSize: 1,
    ...(opts?.employeeId ? { employeeId: opts.employeeId } : {}),
  });

  const fieldSitesQuery = useSchedulingControllerGetMonth(
    {
      month,
      page: 1,
      pageSize: 100,
      ...(opts?.employeeId ? { employeeId: opts.employeeId } : {}),
    },
    { query: { enabled: Boolean(opts?.employeeId) } },
  );

  const overdueQuery = useInvoicePaymentsControllerOutstanding(
    { status: "OVERDUE", page: 1, pageSize: 100 },
    { query: { enabled: office } },
  );

  const certsQuery = useHealthCertificatesControllerExpiring(
    { days: 7, page: 1, pageSize: 1 },
    { query: { enabled: office } },
  );

  const agreementsQuery = useAgreementsControllerExpiring(
    { days: 7, page: 1, pageSize: 1 },
    { query: { enabled: office } },
  );

  const foodQuery = useFoodSchedulesControllerDue(
    { asOf, page: 1, pageSize: 1 },
    { query: { enabled: office } },
  );

  const notificationsQuery = useNotificationsControllerMe({
    unreadOnly: true,
    page: 1,
    pageSize: 5,
  });

  const cashQuery = useCashLedgerControllerCashLedger();

  const outstandingReport = useQuery({
    queryKey: ["dashboard", "outstanding-report"],
    enabled: office,
    queryFn: async () => {
      const res = (await apiFetch(
        `/api/reports/${ReportKind.OUTSTANDING}?page=1&pageSize=100`,
      )) as unknown as { data: OutstandingReport };
      return res.data;
    },
  });

  const auditQuery = useAuditControllerList(
    { page: 1, pageSize: 10 },
    { query: { enabled: opts?.includeAudit === true } },
  );

  const healthQuery = useHealthControllerGetReadiness({
    query: {
      enabled: opts?.includeHealth === true,
      retry: false,
    },
  });

  const summary =
    monthQuery.data?.data.summary ?? emptyMonthSummary(month);

  const cashEmployees = useMemo(() => {
    const employees = cashQuery.data?.data.employees ?? [];
    return employees.map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      collected: asNumber(e.collected),
      handedOver: asNumber(e.handedOver),
      outstanding: asNumber(e.outstanding),
    }));
  }, [cashQuery.data]);

  const cashTotals = useMemo(() => {
    return cashEmployees.reduce(
      (acc, e) => ({
        collected: acc.collected + e.collected,
        handedOver: acc.handedOver + e.handedOver,
        outstanding: acc.outstanding + e.outstanding,
      }),
      { collected: 0, handedOver: 0, outstanding: 0 },
    );
  }, [cashEmployees]);

  const agingTotals = useMemo(() => {
    const totals = outstandingReport.data?.totals;
    return {
      outstanding: asNumber(totals?.outstanding),
      "0_30": asNumber(totals?.["0_30"]),
      "31_60": asNumber(totals?.["31_60"]),
      "61_90": asNumber(totals?.["61_90"]),
      "90_plus": asNumber(totals?.["90_plus"]),
    };
  }, [outstandingReport.data]);

  const agingCounts = useMemo(() => {
    const counts: Partial<Record<"0_30" | "31_60" | "61_90" | "90_plus", number>> = {};
    for (const item of outstandingReport.data?.items ?? []) {
      const key = item.agingBucket;
      if (key === "0_30" || key === "31_60" || key === "61_90" || key === "90_plus") {
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [outstandingReport.data]);

  const overdueAmount = useMemo(() => {
    const items = overdueQuery.data?.data.items ?? [];
    return items.reduce((sum, item) => sum + asNumber(item.outstanding), 0);
  }, [overdueQuery.data]);

  return {
    month,
    summary,
    fieldSitesQuery,
    overdueCount: overdueQuery.data?.data.total ?? 0,
    overdueAmount,
    certsCount: certsQuery.data?.data.total ?? 0,
    agreementsCount: agreementsQuery.data?.data.total ?? 0,
    foodCount: foodQuery.data?.data.total ?? 0,
    unreadCount: notificationsQuery.data?.data.total ?? 0,
    notifications: notificationsQuery.data?.data.items ?? [],
    cashEmployees,
    cashTotals,
    agingTotals,
    agingCounts,
    auditItems: auditQuery.data?.data.items ?? [],
    health: healthQuery.data?.data as
      | {
          status: string;
          checks: Record<string, { status: string }>;
        }
      | undefined,
    healthFetchedAt: healthQuery.dataUpdatedAt
      ? new Date(healthQuery.dataUpdatedAt).toISOString()
      : null,
  };
}

function TodayStrip({
  overdueCount,
  overdueAmount,
  certsCount,
  agreementsCount,
  foodCount,
  unreadCount,
  showUnread,
}: {
  overdueCount: number;
  overdueAmount: number;
  certsCount: number;
  agreementsCount: number;
  foodCount: number;
  unreadCount: number;
  showUnread: boolean;
}) {
  const { t } = useTranslation("dashboard");

  return (
    <section className="space-y-3">
      <h2 className="type-section">{t("sections.today")}</h2>
      <KpiGrid>
        <KpiTile
          to="/payments"
          label={t("kpi.overdueInvoices")}
          count={overdueCount}
          amount={overdueCount > 0 ? overdueAmount : undefined}
          icon={FileText}
          tone={overdueCount > 0 ? "bad" : "neutral"}
          muted={overdueCount === 0}
        />
        <KpiTile
          to="/certificates"
          search={{ expiringWithin: "7" }}
          label={t("kpi.certsExpiring")}
          count={certsCount}
          icon={Award}
          tone={certsCount > 0 ? "warn" : "neutral"}
          muted={certsCount === 0}
        />
        <KpiTile
          to="/agreements"
          label={t("kpi.agreementsExpiring")}
          count={agreementsCount}
          icon={FileSignature}
          tone={agreementsCount > 0 ? "warn" : "neutral"}
          muted={agreementsCount === 0}
        />
        <KpiTile
          to="/food"
          label={t("kpi.foodDue")}
          count={foodCount}
          icon={FlaskConical}
          tone={foodCount > 0 ? "warn" : "neutral"}
          muted={foodCount === 0}
        />
        {showUnread ? (
          <KpiTile
            to="/notifications"
            label={t("kpi.unreadNotifications")}
            count={unreadCount}
            icon={Bell}
            tone={unreadCount > 0 ? "ok" : "neutral"}
            muted={unreadCount === 0}
          />
        ) : null}
      </KpiGrid>
    </section>
  );
}

function OfficeActions() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild className="bg-[#14452F] hover:bg-[#165239]">
        <Link to="/invoices/new">{t("actions.newInvoice")}</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link to="/sites" search={{ hasSubscription: false }}>
          {t("actions.newSubscription")}
        </Link>
      </Button>
      <Button asChild variant="secondary">
        <Link to="/payments">{t("actions.addPayment")}</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link to="/reports/$kind" params={{ kind: "service-coverage" }}>
          {t("actions.issueReport")}
        </Link>
      </Button>
    </div>
  );
}

function AdminDashboard() {
  const { t } = useTranslation("dashboard");
  const data = useDashboardSharedQueries({
    includeAudit: true,
    includeHealth: true,
    includeOfficeWidgets: true,
  });

  const healthChecks = useMemo(() => {
    const checks = data.health?.checks;
    if (!checks) return [];
    return [
      { key: "postgres", label: t("health.postgres"), up: checks.postgres?.status === "up" },
      { key: "redis", label: t("health.redis"), up: checks.redis?.status === "up" },
      { key: "garage", label: t("health.garage"), up: checks.garage?.status === "up" },
      { key: "gotenberg", label: t("health.gotenberg"), up: checks.gotenberg?.status === "up" },
    ];
  }, [data.health, t]);

  return (
    <div className="space-y-8" data-testid="dashboard-admin">
      <PageHeader title={t("title")} />
      <TodayStrip
        overdueCount={data.overdueCount}
        overdueAmount={data.overdueAmount}
        certsCount={data.certsCount}
        agreementsCount={data.agreementsCount}
        foodCount={data.foodCount}
        unreadCount={data.unreadCount}
        showUnread
      />
      <SchedulePulse
        counts={data.summary.counts as Record<ScheduleStatusT, number>}
        totalSites={data.summary.totalSites}
      />
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <CashPositionStrip {...data.cashTotals} />
          <AuditFeed items={data.auditItems} />
        </div>
        <SystemHealthPanel checks={healthChecks} checkedAt={data.healthFetchedAt} />
      </div>
    </div>
  );
}

function OfficeDashboard() {
  const { t } = useTranslation("dashboard");
  const data = useDashboardSharedQueries({ includeOfficeWidgets: true });

  return (
    <div className="space-y-8" data-testid="dashboard-office">
      <PageHeader title={t("title")} actions={<OfficeActions />} />
      <TodayStrip
        overdueCount={data.overdueCount}
        overdueAmount={data.overdueAmount}
        certsCount={data.certsCount}
        agreementsCount={data.agreementsCount}
        foodCount={data.foodCount}
        unreadCount={data.unreadCount}
        showUnread={false}
      />
      <SchedulePulse
        counts={data.summary.counts as Record<ScheduleStatusT, number>}
        totalSites={data.summary.totalSites}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <AgingBar totals={data.agingTotals} counts={data.agingCounts} />
        <CashEmployeesList employees={data.cashEmployees} />
      </div>
    </div>
  );
}

function FieldDashboard() {
  const { t } = useTranslation("dashboard");
  const { t: tn } = useTranslation("notifications");
  const { user } = useRouteContext({ from: "/_shell" });
  const data = useDashboardSharedQueries({ employeeId: user.id });

  const todaySites = useMemo(() => {
    const rows = data.fieldSitesQuery.data?.data.rows ?? [];
    return rows
      .filter(
        (row) =>
          row.status === ScheduleStatus.UPCOMING ||
          row.status === ScheduleStatus.OVERDUE,
      )
      .map((row) => ({
        siteId: row.siteId,
        siteName: row.siteName,
        areaName: row.areaName,
        clientName: row.clientName,
        lastVisitDate: row.lastVisitDate,
        status: row.status,
      }));
  }, [data.fieldSitesQuery.data]);

  const myCash = data.cashEmployees.find((e) => e.employeeId === user.id);

  const notificationItems = data.notifications.map((n) => ({
    id: n.id,
    title: notificationCopy(tn, n.titleI18nKey),
    createdAt: n.createdAt,
  }));

  return (
    <div className="mx-auto max-w-lg space-y-6" data-testid="dashboard-field">
      <FieldBanner
        siteCount={todaySites.length}
        openCash={myCash?.outstanding ?? data.cashTotals.outstanding}
      />
      <section className="space-y-3">
        <h2 className="type-section">{t("sections.fieldSites")}</h2>
        <FieldSitesByArea sites={todaySites} />
      </section>
      <FieldNotifications items={notificationItems} total={data.unreadCount} />
    </div>
  );
}
