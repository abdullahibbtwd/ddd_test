import { InvoiceStatus } from "@ddcrm/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getInvoicesControllerGetOneQueryKey,
  getInvoicesControllerListQueryKey,
  useInvoicesControllerGetOne,
  useInvoicesControllerIssue,
  useInvoicesControllerUpdate,
} from "@/api/generated/invoices/invoices";
import {
  useInvoicePaymentsControllerListPayments,
  useInvoicePaymentsControllerReminderEvents,
  useInvoicePaymentsControllerSendReminder,
} from "@/api/generated/payments/payments";
import {
  downloadInvoicePdfUrl,
  listInvoiceEmailEvents,
  sendInvoiceEmail,
} from "@/api/invoices-documents";
import { isApiRequestError } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { InvoiceForm, type InvoiceFormValues } from "./-invoice-form";
import { InvoicePaymentDrawer } from "./-invoice-payment-drawer";

export const Route = createFileRoute("/_shell/invoices_/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation("invoices");
  const { t: te } = useTranslation("errors");
  const queryClient = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailQueuedJob, setEmailQueuedJob] = useState<string | null>(null);
  const [issuedBanner, setIssuedBanner] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderForce, setReminderForce] = useState(false);
  const { t: tp } = useTranslation("payments");

  const detailQuery = useInvoicesControllerGetOne(id);
  const invoice = detailQuery.data?.data;
  const updateMutation = useInvoicesControllerUpdate();
  const issueMutation = useInvoicesControllerIssue();
  const reminderMutation = useInvoicePaymentsControllerSendReminder();

  const issuedLike =
    !!invoice &&
    (invoice.status === InvoiceStatus.ISSUED ||
      invoice.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE);

  const emailEventsQuery = useQuery({
    queryKey: ["invoice-email-events", id],
    queryFn: async () => (await listInvoiceEmailEvents(id)).data,
    enabled: issuedLike,
  });

  const paymentsQuery = useInvoicePaymentsControllerListPayments(id, {
    query: { enabled: issuedLike && invoice?.documentType === "INVOICE" },
  });

  const reminderEventsQuery = useInvoicePaymentsControllerReminderEvents(id, {
    query: { enabled: issuedLike && invoice?.documentType === "INVOICE" },
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getInvoicesControllerGetOneQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: getInvoicesControllerListQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ["invoice-email-events", id] }),
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${id}/payments`] }),
      queryClient.invalidateQueries({
        queryKey: [`/api/invoices/${id}/reminder-events`],
      }),
    ]);
  }

  async function handleSave(values: InvoiceFormValues) {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          clientId: values.clientId,
          visitIds: values.visitIds,
          lines: values.lines
            .filter((line) => line.description.trim().length > 0)
            .map((line) => ({
              description: line.description.trim(),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
            })),
          notes: values.notes.trim() ? values.notes.trim() : null,
        },
      });
      await invalidate();
      toast.success(t("saveDraft"));
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    }
  }

  async function handleIssue() {
    try {
      const res = await issueMutation.mutateAsync({ id });
      setIssueOpen(false);
      await invalidate();
      const display = res.data.number ?? "";
      setIssuedBanner(display);
      toast.success(t("issuedSuccess", { number: display }));
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    }
  }

  async function handleSendEmail() {
    setEmailSending(true);
    try {
      const res = await sendInvoiceEmail(id, { to: emailTo.trim() || undefined });
      setEmailOpen(false);
      setEmailQueuedJob(res.data.jobId);
      await invalidate();
      toast.success(t("emailQueued", { jobId: res.data.jobId }));
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    } finally {
      setEmailSending(false);
    }
  }

  if (detailQuery.isLoading) {
    return <p className="text-sm text-ink-muted">{t("empty")}</p>;
  }

  if (detailQuery.isError || !invoice) {
    return (
      <div>
        <PageHeader title={t("detailTitle")} />
        <p className="text-sm text-ink-muted">{te("INVOICE_NOT_FOUND")}</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/invoices">{t("back")}</Link>
        </Button>
      </div>
    );
  }

  const isLegalDocument =
    invoice.status === InvoiceStatus.ISSUED ||
    invoice.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE;

  if (isLegalDocument) {
    const snapshot = invoice.snapshot;
    const issuedDate = invoice.issuedAt ? formatIsoDate(invoice.issuedAt.slice(0, 10)) : t("emDash");
    const statusVariant =
      invoice.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE ? "warn" : "ok";

    return (
      <div data-testid="invoice-issued">
        <PageHeader
          title={
            <span className="font-mono text-3xl tracking-tight">
              {invoice.number ?? t("emDash")}
            </span>
          }
          description={
            <StatusBadge variant={statusVariant}>
              {t(`status.${invoice.status}`)}
            </StatusBadge>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild data-testid="invoice-pdf-original">
                <a href={downloadInvoicePdfUrl(id, false)}>{t("downloadPdf")}</a>
              </Button>
              <Button asChild variant="secondary" data-testid="invoice-pdf-copy">
                <a href={downloadInvoicePdfUrl(id, true)}>{t("downloadCopy")}</a>
              </Button>
              <Button
                type="button"
                variant="secondary"
                data-testid="invoice-email-open"
                onClick={() => {
                  setEmailTo(snapshot?.email ?? "");
                  setEmailOpen(true);
                }}
              >
                {t("sendEmail")}
              </Button>
              {invoice.status === InvoiceStatus.ISSUED &&
              invoice.documentType === "INVOICE" ? (
                <>
                  <Button
                    type="button"
                    data-testid="invoice-add-payment"
                    onClick={() => setPaymentOpen(true)}
                  >
                    {tp("addPayment")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="invoice-send-reminder"
                    onClick={() => {
                      setReminderForce(false);
                      setReminderOpen(true);
                    }}
                  >
                    {tp("sendReminder")}
                  </Button>
                  <Button asChild variant="secondary" data-testid="invoice-credit-note">
                    <Link to="/invoices/$id/credit-note" params={{ id }}>
                      {t("creditNote")}
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" data-testid="invoice-debit-note">
                    <Link to="/invoices/$id/debit-note" params={{ id }}>
                      {t("debitNote")}
                    </Link>
                  </Button>
                </>
              ) : null}
              <Button asChild variant="secondary">
                <Link to="/invoices">{t("back")}</Link>
              </Button>
            </div>
          }
        />

        {invoice.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE && invoice.creditNote ? (
          <p
            className="mb-4 text-sm text-ink-muted"
            data-testid="invoice-cancelled-banner"
          >
            {t("cancelledBanner", {
              number: invoice.creditNote.number,
              date: formatIsoDate(invoice.creditNote.issuedAt.slice(0, 10)),
            })}
          </p>
        ) : null}

        {(issuedBanner || emailQueuedJob) && (
          <div className="mb-4 space-y-1 text-sm text-ink-muted">
            {issuedBanner ? (
              <p data-testid="invoice-issued-banner">
                {t("issuedSuccess", { number: issuedBanner })}
              </p>
            ) : null}
            {emailQueuedJob ? (
              <p data-testid="invoice-email-queued">
                {t("emailQueued", { jobId: emailQueuedJob })}
              </p>
            ) : null}
          </div>
        )}

        <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">{t("issued.client")}</dt>
            <dd>{snapshot?.legalName ?? t("emDash")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.eik")}</dt>
            <dd className="font-mono">{snapshot?.eik || t("emDash")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.vatNumber")}</dt>
            <dd className="font-mono">{snapshot?.vatNumber || t("emDash")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.address")}</dt>
            <dd>{snapshot?.registeredAddress || t("emDash")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.representative")}</dt>
            <dd>{snapshot?.legalRepresentative || t("emDash")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.email")}</dt>
            <dd>{snapshot?.email || t("emDash")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.issuedAt")}</dt>
            <dd>{issuedDate}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("issued.issuedBy")}</dt>
            <dd>{invoice.issuedByName ?? t("emDash")}</dd>
          </div>
          {invoice.dueDate ? (
            <div>
              <dt className="text-ink-muted">{tp("dueDate")}</dt>
              <dd>{formatIsoDate(invoice.dueDate)}</dd>
            </div>
          ) : null}
        </dl>

        <h2 className="mb-2 type-section">{t("issued.lines")}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.description")}</TableHead>
              <TableHead numeric>{t("fields.quantity")}</TableHead>
              <TableHead numeric>{t("fields.unitPrice")}</TableHead>
              <TableHead numeric>{t("fields.vatRate")}</TableHead>
              <TableHead numeric>{t("fields.lineTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.description}</TableCell>
                <TableCell numeric className="num">
                  {line.quantity}
                </TableCell>
                <TableCell numeric className="num">
                  {formatMoney(Number(line.unitPrice))}
                </TableCell>
                <TableCell numeric className="num">
                  {line.vatRate}
                  {t("percentSuffix")}
                </TableCell>
                <TableCell numeric className="num">
                  {formatMoney(Number(line.lineTotal))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <div>
            {t("fields.net")}
            {t("labelSep")}
            <span className="num">{formatMoney(Number(invoice.netAmount))}</span>
          </div>
          <div>
            {t("fields.vat")}
            {t("labelSep")}
            <span className="num">{formatMoney(Number(invoice.vatAmount))}</span>
          </div>
          <div className="font-medium">
            {t("fields.gross")}
            {t("labelSep")}
            <span className="num">{formatMoney(Number(invoice.grossAmount))}</span>
          </div>
        </div>

        {invoice.documentType === "INVOICE" ? (
          <div className="mt-8" data-testid="invoice-payments-section">
            <h2 className="mb-2 type-section">{tp("sectionTitle")}</h2>
            <p className="mb-3 text-sm text-ink-muted" data-testid="invoice-outstanding-line">
              {paymentsQuery.data?.data.outstanding === "0.00"
                ? tp("paidLabel")
                : tp("outstandingLine", {
                    amount: formatMoney(
                      Number(paymentsQuery.data?.data.outstanding ?? invoice.grossAmount),
                    ),
                  })}
            </p>
            {(paymentsQuery.data?.data.items.length ?? 0) === 0 ? (
              <p className="text-sm text-ink-muted">{tp("listEmpty")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {paymentsQuery.data?.data.items.map((p) => (
                  <li key={p.id} data-testid={`payment-row-${p.id}`}>
                    {formatIsoDate(p.paidAt)}
                    {t("metaSep")}
                    <span className="num">{formatMoney(Number(p.amount))}</span>
                    {t("metaSep")}
                    {tp(`method.${p.method}`)}
                    {p.collectedByName ? `${t("metaSep")}${p.collectedByName}` : ""}
                    {p.notes ? `${t("metaSep")}${p.notes}` : ""}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6" data-testid="invoice-reminder-history">
              <h3 className="mb-2 text-sm font-medium text-ink-muted">
                {tp("reminderHistory")}
              </h3>
              {(reminderEventsQuery.data?.data.items.length ?? 0) === 0 ? (
                <p className="text-sm text-ink-muted">{tp("reminderHistoryEmpty")}</p>
              ) : (
                <ul className="space-y-2 text-sm text-ink-muted">
                  {reminderEventsQuery.data?.data.items.map((ev) => {
                    const state = ev.sentAt
                      ? t("emailSent")
                      : ev.failedAt
                        ? t("emailFailed")
                        : t("emailPending");
                    const when = ev.sentAt ?? ev.failedAt ?? ev.createdAt;
                    return (
                      <li key={ev.id}>
                        {state}
                        {t("metaSep")}
                        {formatIsoDate(when.slice(0, 10))}
                        {t("metaSep")}
                        {ev.toAddress}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-8" data-testid="invoice-email-history">
          <h2 className="mb-2 type-section text-ink-muted">{t("emailHistory")}</h2>
          {(emailEventsQuery.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-muted">{t("emailHistoryEmpty")}</p>
          ) : (
            <ul className="space-y-2 text-sm text-ink-muted">
              {emailEventsQuery.data?.items.map((ev) => {
                const state = ev.sentAt
                  ? t("emailSent")
                  : ev.failedAt
                    ? t("emailFailed")
                    : t("emailPending");
                const when = ev.sentAt ?? ev.failedAt ?? ev.createdAt;
                return (
                  <li key={ev.id}>
                    {state}
                    {t("metaSep")}
                    {formatIsoDate(when.slice(0, 10))}
                    {t("metaSep")}
                    {ev.toAddress}
                    {ev.error ? `${t("metaSep")}${ev.error}` : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ConfirmDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          title={t("sendEmailTitle")}
          description={t("sendEmailDescription")}
          confirmLabel={t("sendEmailConfirm")}
          onConfirm={() => void handleSendEmail()}
          loading={emailSending}
        >
          <div className="space-y-2">
            <Label htmlFor="invoice-email-to">{t("sendEmailTo")}</Label>
            <Input
              id="invoice-email-to"
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              data-testid="invoice-email-to"
            />
          </div>
        </ConfirmDialog>

        <InvoicePaymentDrawer
          invoiceId={id}
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          onDone={() => void invalidate()}
        />

        <ConfirmDialog
          open={reminderOpen}
          onOpenChange={setReminderOpen}
          title={tp("reminderTitle")}
          description={tp("reminderDescription")}
          confirmLabel={tp("reminderConfirm")}
          loading={reminderMutation.isPending}
          onConfirm={() => {
            void (async () => {
              try {
                await reminderMutation.mutateAsync({
                  id,
                  data: { force: reminderForce || undefined },
                });
                toast.success(tp("reminderQueued"));
                setReminderOpen(false);
                await invalidate();
              } catch (error) {
                toast.error(
                  isApiRequestError(error)
                    ? translateApiError(te, error.code)
                    : te("unknown"),
                );
              }
            })();
          }}
        >
          <label className="flex items-center gap-2 text-sm" data-testid="reminder-force">
            <input
              type="checkbox"
              checked={reminderForce}
              onChange={(e) => setReminderForce(e.target.checked)}
            />
            {tp("reminderForce")}
          </label>
        </ConfirmDialog>
      </div>
    );
  }

  return (
    <div data-testid="invoice-draft">
      <PageHeader
        title={t("draftLabel")}
        description={<StatusBadge variant="neutral">{t("status.DRAFT")}</StatusBadge>}
        actions={
          <Button asChild variant="secondary">
            <Link to="/invoices">{t("back")}</Link>
          </Button>
        }
      />

      {issuedBanner ? (
        <p className="mb-4 text-sm text-ink-muted" data-testid="invoice-issued-banner">
          {t("issuedSuccess", { number: issuedBanner })}
        </p>
      ) : null}

      <InvoiceForm
        key={invoice.updatedAt}
        mode="edit"
        initial={invoice}
        saving={updateMutation.isPending}
        primaryLabel={t("saveDraft")}
        onSubmit={handleSave}
        secondaryAction={
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIssueOpen(true)}
            disabled={issueMutation.isPending || invoice.lines.length === 0}
            data-testid="invoice-issue-open"
          >
            {t("issue")}
          </Button>
        }
      />

      <ConfirmDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title={t("issueTitle")}
        description={t("issueDescription")}
        confirmLabel={t("issueConfirm")}
        onConfirm={() => void handleIssue()}
        loading={issueMutation.isPending}
      />
    </div>
  );
}
