import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useInvoicesControllerGetOne } from "@/api/generated/invoices/invoices";
import { createCreditNote } from "@/api/invoices-documents";
import { isApiRequestError } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_shell/invoices_/$id_/credit-note")({
  component: CreditNotePage,
});

type LineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  originalNet: number;
};

function CreditNotePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("invoices");
  const { t: te } = useTranslation("errors");
  const detailQuery = useInvoicesControllerGetOne(id);
  const invoice = detailQuery.data?.data;

  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);

  const drafts = useMemo(() => {
    if (lines) return lines;
    if (!invoice) return [];
    return invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      originalNet: Number(line.lineTotal),
    }));
  }, [invoice, lines]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    const next = drafts.map((line, i) => (i === index ? { ...line, ...patch } : line));
    setLines(next);
    setLineError(null);
  }

  function validate(): boolean {
    if (reason.trim().length < 3) {
      toast.error(t("reasonRequired"));
      return false;
    }
    for (const line of drafts) {
      const net = Number(line.quantity) * Number(line.unitPrice);
      if (net > line.originalNet + 1e-9) {
        setLineError(t("linesExceedOriginal"));
        return false;
      }
    }
    return true;
  }

  async function handleIssue() {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await createCreditNote(id, {
        referencesInvoiceId: id,
        reason: reason.trim(),
        lines: drafts.map((line) => ({
          description: line.description.trim(),
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
        })),
      });
      setConfirmOpen(false);
      toast.success(t("issuedSuccess", { number: res.data.number ?? "" }));
      await navigate({ to: "/invoices/$id", params: { id: res.data.id } });
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    } finally {
      setSaving(false);
    }
  }

  if (detailQuery.isLoading || !invoice) {
    return <p className="text-sm text-ink-muted">{t("empty")}</p>;
  }

  return (
    <div data-testid="credit-note-form">
      <PageHeader
        title={t("creditNoteTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link to="/invoices/$id" params={{ id }}>
              {t("back")}
            </Link>
          </Button>
        }
      />

      <section className="mb-6 rounded-panel border border-border p-4 text-sm">
        <h2 className="mb-2 type-section">{t("originalSummary")}</h2>
        <p className="font-mono text-lg">{invoice.number}</p>
        <p className="text-ink-muted">
          {invoice.snapshot?.legalName}
          {t("metaSep")}
          {invoice.issuedAt ? formatIsoDate(invoice.issuedAt.slice(0, 10)) : t("emDash")}
          {t("metaSep")}
          <span className="num">{formatMoney(Number(invoice.grossAmount))}</span>
        </p>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.description")}</TableHead>
            <TableHead numeric>{t("fields.quantity")}</TableHead>
            <TableHead numeric>{t("fields.unitPrice")}</TableHead>
            <TableHead numeric>{t("fields.vatRate")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((line, index) => (
            <TableRow key={index}>
              <TableCell>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(index, { description: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  value={line.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  value={line.vatRate}
                  onChange={(e) => updateLine(index, { vatRate: e.target.value })}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {lineError ? <p className="mt-2 text-sm text-bad-ink">{lineError}</p> : null}

      <div className="mt-6 space-y-2">
        <Label htmlFor="credit-reason">{t("reason")}</Label>
        <Textarea
          id="credit-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="credit-note-reason"
        />
      </div>

      <div className="mt-6">
        <Button
          type="button"
          data-testid="credit-note-issue"
          onClick={() => {
            if (validate()) setConfirmOpen(true);
          }}
        >
          {t("creditNoteIssue")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("creditNoteIssueTitle")}
        description={t("creditNoteIssueDescription")}
        confirmLabel={t("creditNoteIssue")}
        onConfirm={() => void handleIssue()}
        loading={saving}
      />
    </div>
  );
}
