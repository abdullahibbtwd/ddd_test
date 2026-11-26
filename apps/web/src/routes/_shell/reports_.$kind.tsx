import {
  ExpirationKind,
  ReportKind,
  RevenueGrouping,
  type ReportKind as ReportKindT,
} from "@ddcrm/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, isApiRequestError } from "@/api/mutator";
import { EmptyState } from "@/components/empty-state";
import { ListToolbar, listFilterControlClass } from "@/components/list-chrome";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";
import { ScheduleStatus } from "@ddcrm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  buildReportExportUrl,
  reportKindFromSlug,
} from "@/lib/report-kind";
import { cn } from "@/lib/utils";
import { formatIsoDate, formatMoney } from "@/lib/format";
import { translateApiError } from "@/lib/error-message";

export const Route = createFileRoute("/_shell/reports_/$kind")({
  component: ReportKindPage,
});

function expirationKindLabel(
  t: TFunction<"reports">,
  kind: string,
): string {
  if (kind === ExpirationKind.CERTIFICATE) return t("expirationKind.CERTIFICATE");
  if (kind === ExpirationKind.AGREEMENT) return t("expirationKind.AGREEMENT");
  if (kind === ExpirationKind.FOOD) return t("expirationKind.FOOD");
  return kind;
}

function coverageBadgeVariant(status: string): StatusVariant {
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

type ReportPage = {
  items: Array<Record<string, unknown>>;
  totals: Record<string, unknown>;
  filter: Record<string, unknown>;
  page: number;
  pageSize: number;
  total: number;
};

function ReportKindPage() {
  const { kind: kindSlug } = Route.useParams();
  const reportKind = reportKindFromSlug(kindSlug);
  const { t } = useTranslation("reports");
  const { t: te } = useTranslation("errors");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState<string>("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMenuKey, setExportMenuKey] = useState(0);

  const filters = useMemo(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(groupBy && reportKind === ReportKind.REVENUE ? { groupBy } : {}),
    }),
    [from, to, groupBy, reportKind],
  );

  const query = useQuery({
    queryKey: ["reports", reportKind, page, pageSize, filters],
    enabled: reportKind !== null,
    queryFn: async () => {
      if (!reportKind) throw new Error("invalid kind");
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...filters,
      });
      // apiFetch returns { data, status, headers } (Orval mutator shape).
      const res = (await apiFetch(
        `/api/reports/${reportKind}?${params.toString()}`,
      )) as unknown as { data: ReportPage };
      return res.data;
    },
  });

  if (!reportKind) {
    return <EmptyState message={t("invalid")} />;
  }
  const kind = reportKind;

  const data = query.data;
  const errorMessage =
    query.error && isApiRequestError(query.error)
      ? translateApiError(te, query.error.code)
      : query.error
        ? te("unknown")
        : null;

  function triggerExport(format: "excel" | "pdf") {
    setExportError(null);
    const url = buildReportExportUrl(kind, format, filters);
    // Direct download — same filters as JSON; no client-side generation.
    window.location.assign(url);
  }

  return (
    <div data-testid={`report-page-${kind}`}>
      <PageHeader
        title={t(`kinds.${kind}.title`)}
        description={t(`kinds.${kind}.description`)}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/reports" className="text-sm text-ink-muted underline-offset-2 hover:underline">
              {t("back")}
            </Link>
            <Select
              key={exportMenuKey}
              onValueChange={(v) => {
                if (v === "excel" || v === "pdf") {
                  triggerExport(v);
                  setExportMenuKey((k) => k + 1);
                }
              }}
            >
              <SelectTrigger
                className={cn(listFilterControlClass, "w-36")}
                data-testid="report-export-menu"
                aria-label={t("export.label")}
              >
                <SelectValue placeholder={t("export.label")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel" data-testid="report-export-excel">
                  {t("export.excel")}
                </SelectItem>
                <SelectItem value="pdf" data-testid="report-export-pdf">
                  {t("export.pdf")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <ListToolbar data-testid="report-filter-bar">
        <Input
          aria-label={t("filters.from")}
          id="report-from"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          data-testid="report-filter-from"
        />
        <Input
          aria-label={t("filters.to")}
          id="report-to"
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          data-testid="report-filter-to"
        />
        {kind === ReportKind.REVENUE ? (
          <Select
            value={groupBy || "__none"}
            onValueChange={(v) => {
              setGroupBy(v === "__none" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label={t("filters.groupBy")} className={cn(listFilterControlClass, "w-full sm:w-44")} data-testid="report-filter-groupby">
              <SelectValue placeholder={t("filters.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{t("filters.all")}</SelectItem>
              {Object.values(RevenueGrouping).map((g) => (
                <SelectItem key={g} value={g}>
                  {t(`groupBy.${g}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {kind === ReportKind.EXPIRATIONS ? (
          <div className="text-sm text-ink-muted">
            {[
              t("expirationKind.CERTIFICATE"),
              t("expirationKind.AGREEMENT"),
              t("expirationKind.FOOD"),
            ].join(" · ")}
          </div>
        ) : null}
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("pageSize")} className={cn(listFilterControlClass, "w-24")} data-testid="report-page-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          className="rounded-lg"
          onClick={() => void query.refetch()}
          data-testid="report-refresh"
        >
          {t("refresh")}
        </Button>
      </ListToolbar>

      {errorMessage ? (
        <p className="mb-3 text-sm text-danger" data-testid="report-error">
          {errorMessage}
        </p>
      ) : null}
      {exportError ? (
        <p className="mb-3 text-sm text-danger" data-testid="report-export-error">
          {exportError}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="text-sm text-ink-muted">{t("loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <div data-testid="report-empty">
          <EmptyState message={t("empty")} />
        </div>
      ) : (
        <>
          <ReportTable kind={kind} items={data.items} totals={data.totals} t={t} />
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function ReportTable({
  kind,
  items,
  totals,
  t,
}: {
  kind: ReportKindT;
  items: Array<Record<string, unknown>>;
  totals: Record<string, unknown>;
  t: TFunction<"reports">;
}) {
  if (kind === ReportKind.REVENUE) {
    return (
      <Table data-testid="report-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.number")}</TableHead>
            <TableHead>{t("columns.client")}</TableHead>
            <TableHead>{t("columns.site")}</TableHead>
            <TableHead className="text-right">{t("columns.net")}</TableHead>
            <TableHead className="text-right">{t("columns.vat")}</TableHead>
            <TableHead className="text-right">{t("columns.gross")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row, i) => (
            <TableRow key={String(row.documentId ?? row.groupKey ?? i)}>
              <TableCell>{String(row.number ?? row.groupLabel ?? "—")}</TableCell>
              <TableCell>{String(row.clientName ?? "—")}</TableCell>
              <TableCell>{String(row.siteName ?? "—")}</TableCell>
              <TableCell className="num text-right">
                {formatMoney(Number(row.netAmount))}
              </TableCell>
              <TableCell className="num text-right">
                {formatMoney(Number(row.vatAmount))}
              </TableCell>
              <TableCell className="num text-right">
                {formatMoney(Number(row.grossAmount))}
              </TableCell>
            </TableRow>
          ))}
          <TableRow data-testid="report-totals" className="sticky bottom-0 bg-[#F8FAFC] font-semibold">
            <TableCell colSpan={3}>{t("totals")}</TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.netAmount))}
            </TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.vatAmount))}
            </TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.grossAmount))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  if (kind === ReportKind.SERVICE_COVERAGE) {
    return (
      <Table data-testid="report-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.site")}</TableHead>
            <TableHead>{t("columns.area")}</TableHead>
            <TableHead>{t("columns.month")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={`${row.siteId}-${row.month}`}>
              <TableCell>{String(row.siteName)}</TableCell>
              <TableCell>{String(row.areaName ?? "—")}</TableCell>
              <TableCell>{String(row.month)}</TableCell>
              <TableCell>
                <StatusBadge variant={coverageBadgeVariant(String(row.status))}>
                  {String(row.status)}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))}
          <TableRow data-testid="report-totals" className="sticky bottom-0 bg-[#F8FAFC] font-semibold">
            <TableCell colSpan={4} className="text-sm text-ink-muted">
              {Object.entries(totals)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  if (kind === ReportKind.OUTSTANDING) {
    return (
      <Table data-testid="report-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.number")}</TableHead>
            <TableHead>{t("columns.client")}</TableHead>
            <TableHead>{t("columns.dueDate")}</TableHead>
            <TableHead className="text-right">{t("columns.gross")}</TableHead>
            <TableHead className="text-right">{t("columns.paid")}</TableHead>
            <TableHead className="text-right">{t("columns.outstanding")}</TableHead>
            <TableHead>{t("columns.aging")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={String(row.invoiceId)}>
              <TableCell>{String(row.number)}</TableCell>
              <TableCell>{String(row.clientName)}</TableCell>
              <TableCell>{formatIsoDate(String(row.dueDate))}</TableCell>
              <TableCell className="num text-right">
                {formatMoney(Number(row.grossAmount))}
              </TableCell>
              <TableCell className="num text-right">
                {formatMoney(Number(row.paidSum))}
              </TableCell>
              <TableCell className="num text-right">
                {formatMoney(Number(row.outstanding))}
              </TableCell>
              <TableCell>{String(row.agingBucket ?? "—")}</TableCell>
            </TableRow>
          ))}
          <TableRow data-testid="report-totals" className="sticky bottom-0 bg-[#F8FAFC] font-semibold">
            <TableCell colSpan={5}>{t("totals")}</TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.outstanding))}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  if (kind === ReportKind.CASH) {
    return (
      <Table data-testid="report-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.employee")}</TableHead>
            <TableHead>{t("columns.date")}</TableHead>
            <TableHead className="text-right">{t("columns.collected")}</TableHead>
            <TableHead className="text-right">{t("columns.handedOver")}</TableHead>
            <TableHead className="text-right">{t("columns.netCash")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row, i) => {
            const net = Number(row.net);
            return (
              <TableRow key={`${row.employeeId}-${row.date}-${i}`}>
                <TableCell>{String(row.employeeName)}</TableCell>
                <TableCell>{formatIsoDate(String(row.date))}</TableCell>
                <TableCell className="num text-right">
                  {formatMoney(Number(row.collected))}
                </TableCell>
                <TableCell className="num text-right">
                  {formatMoney(Number(row.handedOver))}
                </TableCell>
                <TableCell
                  className={`num text-right ${net < 0 ? "text-warn-ink" : ""}`}
                >
                  {formatMoney(net)}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow data-testid="report-totals" className="sticky bottom-0 bg-[#F8FAFC] font-semibold">
            <TableCell colSpan={2}>{t("totals")}</TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.collected))}
            </TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.handedOver))}
            </TableCell>
            <TableCell className="num text-right">
              {formatMoney(Number(totals.net))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  if (kind === ReportKind.EXPIRATIONS) {
    return (
      <Table data-testid="report-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.kind")}</TableHead>
            <TableHead>{t("columns.subject")}</TableHead>
            <TableHead>{t("columns.site")}</TableHead>
            <TableHead>{t("columns.dueDate")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={`${row.kind}-${row.entityId}`}>
              <TableCell>
                {expirationKindLabel(t, String(row.kind))}
              </TableCell>
              <TableCell>{String(row.subject)}</TableCell>
              <TableCell>{String(row.siteName ?? "—")}</TableCell>
              <TableCell>{formatIsoDate(String(row.dueDate))}</TableCell>
              <TableCell>{String(row.status)}</TableCell>
            </TableRow>
          ))}
          <TableRow data-testid="report-totals" className="sticky bottom-0 bg-[#F8FAFC] font-semibold">
            <TableCell colSpan={5} className="text-sm text-ink-muted">
              {Object.entries(totals)
                .map(([k, v]) => `${expirationKindLabel(t, k)}: ${v}`)
                .join(" · ")}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  // PRODUCTS
  return (
    <Table data-testid="report-table">
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.product")}</TableHead>
          <TableHead>{t("columns.activeSubstances")}</TableHead>
          <TableHead>{t("columns.unit")}</TableHead>
          <TableHead className="text-right">{t("columns.quantity")}</TableHead>
          <TableHead>{t("columns.period")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row, i) => (
          <TableRow key={`${row.productId}-${row.period}-${i}`}>
            <TableCell>{String(row.productName)}</TableCell>
            <TableCell>{String(row.activeSubstances ?? "—")}</TableCell>
            <TableCell>{String(row.unit)}</TableCell>
            <TableCell className="num text-right">
              {String(row.totalQuantity)}
            </TableCell>
            <TableCell>{String(row.period)}</TableCell>
          </TableRow>
        ))}
        <TableRow data-testid="report-totals" className="sticky bottom-0 bg-[#F8FAFC] font-semibold">
          <TableCell colSpan={5} className="text-sm text-ink-muted">
            {Object.entries((totals.byUnit as Record<string, string>) ?? {})
              .map(([unit, qty]) => `${qty} ${unit}`)
              .join(" · ") || t("empty")}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
