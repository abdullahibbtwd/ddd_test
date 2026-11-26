import { todayInSofia, VisitStatus, type VisitItem } from "@ddcrm/shared";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useVisitPaymentsControllerCreateVisitPayment } from "@/api/generated/payments/payments";
import { useVisitsControllerList } from "@/api/generated/visits/visits";
import { isApiRequestError } from "@/api/mutator";
import { useAbility } from "@/auth/ability";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translateApiError } from "@/lib/error-message";
import { formatIsoDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SitesVisitsPanelProps = {
  siteId: string;
};

export function SitesVisitsPanel({ siteId }: SitesVisitsPanelProps) {
  const { t } = useTranslation("sites");
  const { t: tv } = useTranslation("visits");
  const { t: tp } = useTranslation("payments");
  const { t: te } = useTranslation("errors");
  const ability = useAbility();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [payVisit, setPayVisit] = useState<VisitItem | null>(null);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayInSofia(new Date()));
  const [notes, setNotes] = useState("");
  const createPayment = useVisitPaymentsControllerCreateVisitPayment();

  const canCreate = ability.can("create", "Visit");
  const canPay = ability.can("create", "Payment");

  const listQuery = useVisitsControllerList({ siteId, page, pageSize });
  const items = useMemo(
    () => (listQuery.data?.data.items ?? []) as VisitItem[],
    [listQuery.data],
  );
  const total = listQuery.data?.data.total ?? 0;
  const hasMore = page * pageSize < total;

  async function handleSavePayment() {
    if (!payVisit) return;
    try {
      await createPayment.mutateAsync({
        visitId: payVisit.id,
        data: { amount, paidAt, notes: notes || null },
      });
      setPayVisit(null);
      setAmount("");
      setNotes("");
      toast.success(tp("savePayment"));
      void listQuery.refetch();
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  return (
    <div className="space-y-4" data-testid="visits-panel">
      {canCreate ? (
        <Button
          className="w-full"
          onClick={() =>
            void navigate({
              to: "/visits/new",
              search: { siteId },
            })
          }
        >
          {t("visits.new")}
        </Button>
      ) : null}

      {items.length === 0 && !listQuery.isLoading ? (
        <p className="text-sm text-ink-muted" data-testid="visits-empty">
          {t("visits.empty")}
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {items.map((visit) => {
          const cancelled = visit.status === VisitStatus.CANCELLED;
          const hasInvoice = !!visit.invoiceId;
          return (
            <li key={visit.id} className="py-3">
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 text-left",
                  cancelled && "text-ink-muted",
                )}
                onClick={() =>
                  void navigate({
                    to: "/visits/$id/edit",
                    params: { id: visit.id },
                  })
                }
              >
                <span className={cn("text-sm", cancelled && "line-through")}>
                  {formatIsoDate(visit.visitDate)}
                  {t("visits.metaSep")}
                  {tv(`treatmentTypes.${visit.treatmentType}`)}
                  {t("visits.metaSep")}
                  <span className="num">{formatMoney(visit.chargedAmount)}</span>
                  {cancelled ? (
                    <span className="ml-2 text-xs text-ink-muted no-underline">
                      {t("visits.cancelled")}
                    </span>
                  ) : null}
                </span>
                {cancelled && visit.cancelReason ? (
                  <span className="text-xs text-ink-muted">{visit.cancelReason}</span>
                ) : null}
              </button>
              {canPay && !cancelled ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-ink-muted">{tp("sectionTitle")}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid={`visit-add-payment-${visit.id}`}
                    disabled={!hasInvoice}
                    title={hasInvoice ? undefined : te("VISIT_NOT_INVOICED")}
                    onClick={() => {
                      setPaidAt(todayInSofia(new Date()));
                      setPayVisit(visit);
                    }}
                  >
                    {tp("addPayment")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setPage((p) => p + 1)}
          disabled={listQuery.isFetching}
        >
          {t("visits.loadMore")}
        </Button>
      ) : null}

      <Drawer
        open={!!payVisit}
        onOpenChange={(open) => {
          if (!open) setPayVisit(null);
        }}
        title={tp("addPayment")}
      >
        <div className="space-y-4 p-4" data-testid="visit-payment-drawer">
          <div className="space-y-1">
            <Label htmlFor="visit-pay-amount">{tp("fields.amount")}</Label>
            <Input
              id="visit-pay-amount"
              data-testid="visit-payment-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="visit-pay-date">{tp("fields.paidAt")}</Label>
            <Input
              id="visit-pay-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="visit-pay-notes">{tp("fields.notes")}</Label>
            <Input
              id="visit-pay-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            data-testid="visit-payment-save"
            disabled={!amount || createPayment.isPending}
            onClick={() => void handleSavePayment()}
          >
            {tp("savePayment")}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
