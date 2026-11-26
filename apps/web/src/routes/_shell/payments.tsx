import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useInvoicePaymentsControllerOutstanding,
} from "@/api/generated/payments/payments";
import {
  ListToolbar,
  listFilterControlClass,
  MobileListCard,
  ResponsiveList,
} from "@/components/list-chrome";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
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
import { cn } from "@/lib/utils";
import { formatIsoDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_shell/payments")({
  component: PaymentsOutstandingPage,
});

type ClassFilter =
  | ""
  | "UNPAID_CURRENT"
  | "OVERDUE"
  | "PAID"
  | "CANCELLED";

function classificationVariant(
  c: string,
): "neutral" | "ok" | "warn" | "bad" {
  switch (c) {
    case "PAID":
      return "ok";
    case "OVERDUE":
      return "bad";
    case "CANCELLED":
      return "neutral";
    default:
      return "warn";
  }
}

function PaymentsOutstandingPage() {
  const { t } = useTranslation("payments");
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ClassFilter>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, status, from, to],
  );

  const query = useInvoicePaymentsControllerOutstanding(params);
  const data = query.data?.data;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;

  return (
    <div data-testid="payments-outstanding">
      <PageHeader title={t("title")} description={t("description")} />

      <ListToolbar>
        <Select
          value={status || "__all"}
          onValueChange={(v) => {
            setStatus(v === "__all" ? "" : (v as ClassFilter));
            setPage(1);
          }}
        >
          <SelectTrigger
            className={cn(listFilterControlClass, "w-full sm:w-48")}
            aria-label={t("filters.status")}
            data-testid="payments-filter-status"
          >
            <SelectValue placeholder={t("filters.statusAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.statusAll")}</SelectItem>
            <SelectItem value="UNPAID_CURRENT">{t("classification.UNPAID_CURRENT")}</SelectItem>
            <SelectItem value="OVERDUE">{t("classification.OVERDUE")}</SelectItem>
            <SelectItem value="PAID">{t("classification.PAID")}</SelectItem>
            <SelectItem value="CANCELLED">{t("classification.CANCELLED")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          id="pay-from"
          type="date"
          aria-label={t("filters.from")}
          title={t("filters.from")}
          className={cn(listFilterControlClass, "w-full sm:w-40")}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <Input
          id="pay-to"
          type="date"
          aria-label={t("filters.to")}
          title={t("filters.to")}
          className={cn(listFilterControlClass, "w-full sm:w-40")}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </ListToolbar>

      <ResponsiveList
        table={
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.number")}</TableHead>
            <TableHead>{t("columns.client")}</TableHead>
            <TableHead>{t("columns.dueDate")}</TableHead>
            <TableHead numeric>{t("columns.gross")}</TableHead>
            <TableHead numeric>{t("columns.paid")}</TableHead>
            <TableHead numeric>{t("columns.outstanding")}</TableHead>
            <TableHead>{t("columns.classification")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.items.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-ink-muted">
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            data?.items.map((row) => (
              <TableRow
                key={row.invoiceId}
                className="cursor-pointer"
                data-testid={`outstanding-row-${row.number}`}
                onClick={() =>
                  void navigate({ to: "/invoices/$id", params: { id: row.invoiceId } })
                }
              >
                <TableCell className="font-mono">{row.number}</TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{formatIsoDate(row.dueDate)}</TableCell>
                <TableCell numeric className="num">
                  {formatMoney(Number(row.grossAmount))}
                </TableCell>
                <TableCell numeric className="num">
                  {formatMoney(Number(row.paidSum))}
                </TableCell>
                <TableCell numeric className="num">
                  {formatMoney(Number(row.outstanding))}
                </TableCell>
                <TableCell>
                  <StatusBadge variant={classificationVariant(row.classification)}>
                    {t(`classification.${row.classification}` as const)}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
        }
        cards={
          (data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-[#64748B]">{t("empty")}</p>
          ) : (
            <ul className="space-y-3">
              {data?.items.map((row) => (
                <li key={row.invoiceId}>
                  <MobileListCard
                    data-testid={`outstanding-row-mobile-${row.number}`}
                    onClick={() =>
                      void navigate({ to: "/invoices/$id", params: { id: row.invoiceId } })
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-mono text-sm font-semibold text-[#0F172A]">
                        {row.number}
                      </p>
                      <StatusBadge variant={classificationVariant(row.classification)}>
                        {t(`classification.${row.classification}` as const)}
                      </StatusBadge>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-[#475569]">{row.clientName}</p>
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <span className="text-xs tabular-nums text-[#64748B]">
                        {formatIsoDate(row.dueDate)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-[#0F172A]">
                        {formatMoney(Number(row.outstanding))}
                      </span>
                    </div>
                  </MobileListCard>
                </li>
              ))}
            </ul>
          )
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
      />
    </div>
  );
}
