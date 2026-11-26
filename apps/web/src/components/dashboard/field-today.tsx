import { CertificateStatus } from "@ddcrm/shared";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, MapPin } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  certifiedEmployeesControllerCertifiedEmployees,
  getCertifiedEmployeesControllerCertifiedEmployeesQueryKey,
} from "@/api/generated/sites/sites";
import { formatIsoDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FieldBanner({
  siteCount,
  openCash,
}: {
  siteCount: number;
  openCash: number;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <section className="overflow-hidden rounded-2xl bg-[#14452F] px-5 py-5 text-[#ffffff]">
      <h1 className="text-xl font-bold tracking-tight">
        {t("field.greeting", { count: siteCount })}
      </h1>
      <Link
        to="/cash"
        className="mt-3 inline-flex items-center rounded-full bg-[rgb(255_255_255/0.12)] px-3 py-1.5 text-sm text-[#A7D4C0] no-underline hover:bg-[rgb(255_255_255/0.18)] hover:text-[#ffffff] hover:no-underline"
      >
        {t("cash.myOpen", { amount: formatMoney(openCash) })}
      </Link>
    </section>
  );
}

type FieldSite = {
  siteId: string;
  siteName: string;
  areaName: string;
  clientName: string;
  lastVisitDate: string | null;
  status: string;
};

type CertAlert = {
  fullName: string;
  nextRenewalAt: string;
  status: string;
};

function useSiteCertAlerts(siteIds: string[]) {
  const queries = useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: getCertifiedEmployeesControllerCertifiedEmployeesQueryKey(siteId),
      queryFn: () => certifiedEmployeesControllerCertifiedEmployees(siteId),
      staleTime: 60_000,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, CertAlert | null>();
    siteIds.forEach((siteId, index) => {
      const items = queries[index]?.data?.data.items ?? [];
      const alert = items.find(
        (item) =>
          item.nextRenewalAt &&
          (item.status === CertificateStatus.EXPIRING ||
            item.status === CertificateStatus.EXPIRED),
      );
      map.set(
        siteId,
        alert?.nextRenewalAt
          ? {
              fullName: alert.fullName,
              nextRenewalAt: alert.nextRenewalAt,
              status: alert.status ?? CertificateStatus.EXPIRING,
            }
          : null,
      );
    });
    return map;
  }, [queries, siteIds]);
}

function FieldSiteCard({
  site,
  certAlert,
}: {
  site: FieldSite;
  certAlert: CertAlert | null;
}) {
  const { t } = useTranslation("dashboard");

  return (
    <li className="rounded-2xl border border-[#E2E8F0]/80 bg-[#ffffff] p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#0F172A]">
            {site.siteName}
          </p>
          <p className="mt-0.5 truncate text-sm text-[#64748B]">{site.clientName}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            site.status === "OVERDUE"
              ? "bg-[#F5E1E1] text-[#9B3B3B]"
              : "bg-[#F8EED7] text-[#8A5A12]",
          )}
        >
          {site.status === "OVERDUE" ? t("field.overdueBadge") : t("field.upcomingBadge")}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-sm text-[#475569]">
        <MapPin className="size-3.5 shrink-0 text-[#94A3B8]" aria-hidden="true" />
        <Link
          to="/sites"
          search={{ siteId: site.siteId }}
          className="truncate text-[#14452F] no-underline hover:underline"
        >
          {site.clientName}
        </Link>
      </div>

      {site.lastVisitDate ? (
        <p className="mt-1.5 text-xs text-[#94A3B8]">
          {t("field.lastVisit", { date: formatIsoDate(site.lastVisitDate) })}
        </p>
      ) : null}

      {certAlert ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-xl border border-[#E8C56A]/60 bg-[#FFF8E8] px-3 py-2.5 text-sm text-[#8A5A12]"
          data-testid="field-cert-alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {t("field.certAlert", {
              name: certAlert.fullName,
              date: formatIsoDate(certAlert.nextRenewalAt),
            })}
          </p>
        </div>
      ) : null}

      <Link
        to="/visits/new"
        search={{ siteId: site.siteId }}
        className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#14452F] text-sm font-semibold text-[#ffffff] no-underline transition-colors hover:bg-[#165239] hover:no-underline"
      >
        {t("actions.startVisit")} →
      </Link>
    </li>
  );
}

export function FieldSitesByArea({ sites }: { sites: FieldSite[] }) {
  const { t } = useTranslation("dashboard");
  const siteIds = useMemo(() => sites.map((s) => s.siteId), [sites]);
  const certAlerts = useSiteCertAlerts(siteIds);

  const grouped = new Map<string, FieldSite[]>();
  for (const site of sites) {
    const key = site.areaName || t("field.areaFallback");
    const list = grouped.get(key) ?? [];
    list.push(site);
    grouped.set(key, list);
  }

  if (sites.length === 0) {
    return <p className="text-sm text-[#64748B]">{t("field.noSites")}</p>;
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([area, areaSites]) => (
        <section key={area}>
          <h2 className="sticky top-16 z-10 -mx-1 mb-3 bg-[#F8FAFC]/95 px-1 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#64748B] uppercase backdrop-blur-sm">
            {area}
          </h2>
          <ul className="space-y-3">
            {areaSites.map((site) => (
              <FieldSiteCard
                key={site.siteId}
                site={site}
                certAlert={certAlerts.get(site.siteId) ?? null}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function FieldNotifications({
  items,
  total,
}: {
  items: Array<{ id: string; title: string; createdAt: string }>;
  total: number;
}) {
  const { t } = useTranslation("dashboard");
  if (total === 0) return null;

  return (
    <section className="rounded-xl border border-[#E2E8F0]/80 bg-[#ffffff] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#0F172A]">
          {t("sections.notifications")} ({total})
        </h2>
        <Link
          to="/notifications"
          className="text-xs font-medium text-[#14452F] no-underline hover:underline"
        >
          {t("field.openNotifications")}
        </Link>
      </div>
      <ul className="divide-y divide-[#E2E8F0]/80">
        {items.slice(0, 3).map((item) => (
          <li key={item.id}>
            <Link
              to="/notifications"
              className="flex min-h-11 items-center gap-3 py-2.5 text-sm text-[#1E293B] no-underline hover:no-underline"
            >
              <span className="size-2 shrink-0 rounded-full bg-[#14452F]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
