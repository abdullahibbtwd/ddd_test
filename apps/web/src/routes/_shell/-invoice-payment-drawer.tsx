import { PaymentRecordMethod, todayInSofia } from "@ddcrm/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useInvoicePaymentsControllerCreatePayment } from "@/api/generated/payments/payments";
import { useUsersControllerList } from "@/api/generated/users/users";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
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
import { translateApiError } from "@/lib/error-message";

export type InvoicePaymentDrawerProps = {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

export function InvoicePaymentDrawer({
  invoiceId,
  open,
  onOpenChange,
  onDone,
}: InvoicePaymentDrawerProps) {
  const { t } = useTranslation("payments");
  const { t: te } = useTranslation("errors");
  const createMutation = useInvoicePaymentsControllerCreatePayment();
  const fieldUsersQuery = useUsersControllerList({
    page: 1,
    pageSize: 100,
    role: "FIELD",
    isActive: true,
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(PaymentRecordMethod.BANK_TRANSFER);
  const [paidAt, setPaidAt] = useState(todayInSofia(new Date()));
  const [collectedByUserId, setCollectedByUserId] = useState("");
  const [notes, setNotes] = useState("");

  const isCash = method === PaymentRecordMethod.CASH;

  async function handleSave() {
    try {
      await createMutation.mutateAsync({
        id: invoiceId,
        data: {
          amount,
          method: method as "CASH" | "BANK_TRANSFER" | "CARD",
          paidAt,
          collectedByUserId: isCash ? collectedByUserId : null,
          notes: notes || null,
        },
      });
      onOpenChange(false);
      setAmount("");
      setNotes("");
      onDone();
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t("addPayment")}>
      <div className="space-y-4 p-4" data-testid="invoice-payment-drawer">
        <div className="space-y-1">
          <Label htmlFor="pay-amount">{t("fields.amount")}</Label>
          <Input
            id="pay-amount"
            data-testid="payment-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <Label>{t("fields.method")}</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger data-testid="payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">{t("method.CASH")}</SelectItem>
              <SelectItem value="BANK_TRANSFER">{t("method.BANK_TRANSFER")}</SelectItem>
              <SelectItem value="CARD">{t("method.CARD")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pay-date">{t("fields.paidAt")}</Label>
          <Input
            id="pay-date"
            type="date"
            data-testid="payment-paid-at"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
        {isCash ? (
          <div className="space-y-1" data-testid="payment-collector-field">
            <Label>{t("fields.collectedBy")}</Label>
            <Select
              value={collectedByUserId || undefined}
              onValueChange={setCollectedByUserId}
            >
              <SelectTrigger data-testid="payment-collector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(fieldUsersQuery.data?.data.items ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="pay-notes">{t("fields.notes")}</Label>
          <Input
            id="pay-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          data-testid="payment-save"
          disabled={
            !amount ||
            (isCash && !collectedByUserId) ||
            createMutation.isPending
          }
          onClick={() => void handleSave()}
        >
          {t("savePayment")}
        </Button>
      </div>
    </Drawer>
  );
}
