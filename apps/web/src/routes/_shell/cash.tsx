import { Role, todayInSofia } from "@ddcrm/shared";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useCashHandoversControllerCreate,
  useCashLedgerControllerCashLedger,
} from "@/api/generated/payments/payments";
import { useUsersControllerList } from "@/api/generated/users/users";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { translateApiError } from "@/lib/error-message";
import { formatIsoDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_shell/cash")({
  component: CashLedgerPage,
});

function CashLedgerPage() {
  const { t } = useTranslation("cash");
  const { t: te } = useTranslation("errors");
  const { user } = useRouteContext({ from: "/_shell" });
  const isOffice = user?.role === Role.ADMIN || user?.role === Role.OFFICE;
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);

  const ledgerQuery = useCashLedgerControllerCashLedger();
  const employees = ledgerQuery.data?.data.employees ?? [];
  const selected =
    employees.find((e) => e.employeeId === selectedEmployeeId) ?? employees[0] ?? null;

  return (
    <div data-testid="cash-ledger">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          isOffice ? (
            <Button
              data-testid="cash-handover-open"
              onClick={() => setHandoverOpen(true)}
            >
              {t("handover")}
            </Button>
          ) : null
        }
      />

      {employees.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => {
            const negative = Number(emp.outstanding) < 0;
            return (
              <button
                key={emp.employeeId}
                type="button"
                data-testid={`cash-employee-${emp.employeeId}`}
                className={`rounded-xl border p-4 text-left shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors ${
                  selected?.employeeId === emp.employeeId
                    ? "border-[#14452F] bg-[#F8FAFC]"
                    : "border-[#E2E8F0] bg-[#ffffff] hover:border-[#14452F]/25 hover:bg-[#F8FAFC]/60"
                }`}
                onClick={() => setSelectedEmployeeId(emp.employeeId)}
              >
                <div className="font-medium">{emp.employeeName}</div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">{t("collected")}</dt>
                    <dd className="num">{formatMoney(Number(emp.collected))}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">{t("handedOver")}</dt>
                    <dd className="num">{formatMoney(Number(emp.handedOver))}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">
                      {negative ? t("overHanded") : t("outstanding")}
                    </dt>
                    <dd
                      className={`num ${negative ? "text-status-bad" : ""}`}
                      data-testid={`cash-outstanding-${emp.employeeId}`}
                    >
                      {formatMoney(Number(emp.outstanding))}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="mt-8" data-testid="cash-day-detail">
          <h2 className="mb-3 type-section">
            {t("dayDetail")}
            {t("dayDetailSep")}
            {selected.employeeName}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead numeric>{t("columns.collected")}</TableHead>
                <TableHead numeric>{t("columns.handedOver")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.days.map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="tabular-nums">{formatIsoDate(d.date)}</TableCell>
                  <TableCell numeric className="num">
                    {formatMoney(Number(d.collected))}
                  </TableCell>
                  <TableCell numeric className="num">
                    {formatMoney(Number(d.handedOver))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {isOffice && user ? (
        <HandoverDrawer
          open={handoverOpen}
          onOpenChange={setHandoverOpen}
          defaultReceiverId={user.id}
          onDone={() => void ledgerQuery.refetch()}
          te={te}
          t={t}
        />
      ) : null}
    </div>
  );
}

function HandoverDrawer({
  open,
  onOpenChange,
  defaultReceiverId,
  onDone,
  t,
  te,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultReceiverId: string;
  onDone: () => void;
  t: TFunction<"cash">;
  te: TFunction<"errors">;
}) {
  const fieldUsersQuery = useUsersControllerList({
    page: 1,
    pageSize: 100,
    role: "FIELD",
    isActive: true,
  });
  const officeUsersQuery = useUsersControllerList({
    page: 1,
    pageSize: 100,
    isActive: true,
  });
  const createMutation = useCashHandoversControllerCreate();
  const fieldUsers = fieldUsersQuery.data?.data.items ?? [];
  const receivers = useMemo(
    () =>
      (officeUsersQuery.data?.data.items ?? []).filter(
        (u) => u.role === "ADMIN" || u.role === "OFFICE",
      ),
    [officeUsersQuery.data],
  );

  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [handedOverAt, setHandedOverAt] = useState(todayInSofia(new Date()));
  const [receivedByUserId, setReceivedByUserId] = useState(defaultReceiverId);
  const [notes, setNotes] = useState("");

  async function handleSave() {
    try {
      await createMutation.mutateAsync({
        data: {
          employeeId,
          amount,
          handedOverAt,
          receivedByUserId,
          notes: notes || null,
        },
      });
      toast.success(t("handoverSuccess"));
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t("handoverTitle")}>
      <div className="space-y-4 p-4">
        <div className="space-y-1">
          <Label>{t("fields.employee")}</Label>
          <Select value={employeeId || undefined} onValueChange={setEmployeeId}>
            <SelectTrigger data-testid="handover-employee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="handover-amount">{t("fields.amount")}</Label>
          <Input
            id="handover-amount"
            data-testid="handover-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="handover-date">{t("fields.handedOverAt")}</Label>
          <Input
            id="handover-date"
            type="date"
            value={handedOverAt}
            onChange={(e) => setHandedOverAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("fields.receivedBy")}</Label>
          <Select
            value={receivedByUserId || undefined}
            onValueChange={setReceivedByUserId}
          >
            <SelectTrigger data-testid="handover-received-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={defaultReceiverId}>{t("emDash")}</SelectItem>
              {receivers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="handover-notes">{t("fields.notes")}</Label>
          <Input
            id="handover-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          data-testid="handover-save"
          disabled={!employeeId || !amount || createMutation.isPending}
          onClick={() => void handleSave()}
        >
          {t("saveHandover")}
        </Button>
      </div>
    </Drawer>
  );
}
