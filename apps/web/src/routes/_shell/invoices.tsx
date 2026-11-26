import { InvoiceStatus } from "@ddcrm/shared";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInvoicesControllerList } from "@/api/generated/invoices/invoices";
import { EmptyState } from "@/components/empty-state";
import { MobileListCard, ResponsiveList } from "@/components/list-chrome";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate, formatMoney } from "@/lib/format";
import { InvoiceBatchDrawer } from "./-invoice-batch-drawer";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_shell/invoices")({
  component: InvoicesPage,
});

function isoDateFromTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function InvoicesPage() {
  const { t } = useTranslation("invoices");
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [batchOpen, setBatchOpen] = useState(false);

  const listQuery = useInvoicesControllerList({ page, pageSize: PAGE_SIZE });
  const items = listQuery.data?.data.items ?? [];
  const total = listQuery.data?.data.total ?? 0;
  const isLoading = listQuery.isLoading;
  const isError = listQuery.isError;

  return (
    <div>
      <PageHeader
        title={t("title")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBatchOpen(true)}
              data-testid="batch-invoicing-open"
            >
              {t("batchInvoicing")}
            </Button>
            <Button asChild>
              <Link to="/invoices/new">{t("newInvoice")}</Link>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <p className="text-sm text-ink-muted">{t("empty")}</p>
      ) : isError || items.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <>
          <ResponsiveList
            table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.number")}</TableHead>
                <TableHead>{t("columns.client")}</TableHead>
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead numeric>{t("columns.amount")}</TableHead>
                <TableHead>{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const dateIso =
                  row.status === InvoiceStatus.ISSUED ||
                  row.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
                    ? isoDateFromTimestamp(row.issuedAt)
                    : isoDateFromTimestamp(row.createdAt);
                const statusVariant =
                  row.status === InvoiceStatus.ISSUED
                    ? "ok"
                    : row.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
                      ? "warn"
                      : "neutral";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.number ?? t("draftLabel")}
                    </TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell>{dateIso ? formatIsoDate(dateIso) : t("emDash")}</TableCell>
                    <TableCell>
                      <StatusBadge variant={statusVariant}>
                        {t(`status.${row.status}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell numeric className="num">
                      {formatMoney(Number(row.grossAmount))}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="secondary">
                        <Link to="/invoices/$id" params={{ id: row.id }}>
                          {t("open")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
            }
            cards={
              <ul className="space-y-3">
                {items.map((row) => {
                  const dateIso =
                    row.status === InvoiceStatus.ISSUED ||
                    row.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
                      ? isoDateFromTimestamp(row.issuedAt)
                      : isoDateFromTimestamp(row.createdAt);
                  const statusVariant =
                    row.status === InvoiceStatus.ISSUED
                      ? "ok"
                      : row.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
                        ? "warn"
                        : "neutral";
                  return (
                    <li key={row.id}>
                      <MobileListCard
                        onClick={() =>
                          void navigate({ to: "/invoices/$id", params: { id: row.id } })
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate font-mono text-sm font-semibold text-[#0F172A]">
                            {row.number ?? t("draftLabel")}
                          </p>
                          <StatusBadge variant={statusVariant}>
                            {t(`status.${row.status}`)}
                          </StatusBadge>
                        </div>
                        <p className="mt-1.5 truncate text-sm text-[#475569]">{row.clientName}</p>
                        <div className="mt-2.5 flex items-center justify-between gap-3">
                          <span className="text-xs tabular-nums text-[#64748B]">
                            {dateIso ? formatIsoDate(dateIso) : t("emDash")}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-[#0F172A]">
                            {formatMoney(Number(row.grossAmount))}
                          </span>
                        </div>
                      </MobileListCard>
                    </li>
                  );
                })}
              </ul>
            }
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <InvoiceBatchDrawer
        open={batchOpen}
        onOpenChange={setBatchOpen}
        onDone={() => void listQuery.refetch()}
      />
    </div>
  );
}
