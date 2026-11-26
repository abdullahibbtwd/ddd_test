import { monthOf, todayInSofia } from "@ddcrm/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAreasControllerList } from "@/api/generated/areas/areas";
import {
  batchCreateInvoices,
  batchIssueInvoices,
} from "@/api/invoices-documents";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translateApiError } from "@/lib/error-message";

type Step = "plan" | "created" | "issued";

export type InvoiceBatchDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

export function InvoiceBatchDrawer({ open, onOpenChange, onDone }: InvoiceBatchDrawerProps) {
  const { t } = useTranslation("invoices");
  const { t: te } = useTranslation("errors");
  const [month, setMonth] = useState(() => monthOf(todayInSofia(new Date())));
  const [areaId, setAreaId] = useState("");
  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState<{ created: number; skipped: number; siteIds: string[] } | null>(
    null,
  );
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issueResult, setIssueResult] = useState<{
    issued: string[];
    failed: Array<{ id: string; reason: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const areasQuery = useAreasControllerList({ page: 1, pageSize: 100 });
  const areas = areasQuery.data?.data.items ?? [];

  function reset() {
    setStep("plan");
    setPlan(null);
    setCreatedIds([]);
    setSelected(new Set());
    setIssueResult(null);
  }

  async function handlePreview() {
    setBusy(true);
    try {
      const res = await batchCreateInvoices({
        month,
        areaId: areaId || undefined,
        dryRun: true,
      });
      setPlan({
        created: res.data.created,
        skipped: res.data.skipped,
        siteIds: res.data.siteIds,
      });
      setStep("plan");
    } catch (err) {
      if (isApiRequestError(err)) toast.error(translateApiError(te, err.code));
      else toast.error(te("unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    try {
      const res = await batchCreateInvoices({
        month,
        areaId: areaId || undefined,
        dryRun: false,
      });
      const ids = res.data.createdIds ?? [];
      setCreatedIds(ids);
      setSelected(new Set(ids));
      setPlan({
        created: res.data.created,
        skipped: res.data.skipped,
        siteIds: res.data.siteIds,
      });
      setStep("created");
      toast.success(t("batchCreated", { count: res.data.created }));
    } catch (err) {
      if (isApiRequestError(err)) toast.error(translateApiError(te, err.code));
      else toast.error(te("unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function handleIssue() {
    setBusy(true);
    try {
      const res = await batchIssueInvoices({
        invoiceIds: [...selected],
      });
      setIssueResult(res.data);
      setStep("issued");
      onDone?.();
    } catch (err) {
      if (isApiRequestError(err)) toast.error(translateApiError(te, err.code));
      else toast.error(te("unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("batchInvoicing")}
      className="sm:max-w-xl"
      footer={
        <div className="flex flex-wrap gap-2">
          {step === "plan" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void handlePreview()}
                data-testid="batch-preview"
              >
                {t("batchPreview")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void handleCreate()}
                data-testid="batch-create"
              >
                {t("batchCreate")}
              </Button>
            </>
          ) : null}
          {step === "created" ? (
            <Button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void handleIssue()}
              data-testid="batch-issue"
            >
              {t("batchIssueSelected")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4" data-testid="batch-drawer">
        <div className="space-y-2">
          <Label htmlFor="batch-month">{t("batchMonth")}</Label>
          <Input
            id="batch-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={step !== "plan"}
            data-testid="batch-month"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="batch-area">{t("batchArea")}</Label>
          <select
            id="batch-area"
            className="flex h-10 w-full rounded-control border border-border bg-surface px-3 text-sm"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            disabled={step !== "plan"}
            data-testid="batch-area"
          >
            <option value="">{t("batchAreaAll")}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>

        {plan ? (
          <p className="text-sm text-ink-muted" data-testid="batch-plan">
            {t("batchPlan", { created: plan.created, skipped: plan.skipped })}
          </p>
        ) : null}

        {step === "created" ? (
          <div className="space-y-2" data-testid="batch-created-list">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelected(new Set(createdIds))}
            >
              {t("batchSelectAll")}
            </Button>
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">
              {createdIds.map((invoiceId) => (
                <li key={invoiceId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(invoiceId)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(invoiceId);
                      else next.delete(invoiceId);
                      setSelected(next);
                    }}
                  />
                  <span className="font-mono text-xs">{invoiceId}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === "issued" && issueResult ? (
          <div className="space-y-2 text-sm" data-testid="batch-issue-results">
            <p>{t("batchIssueResults")}</p>
            <p>{t("batchIssued", { count: issueResult.issued.length })}</p>
            <p>{t("batchFailed", { count: issueResult.failed.length })}</p>
            {issueResult.failed.length > 0 ? (
              <ul className="space-y-1 text-ink-muted">
                {issueResult.failed.map((f) => {
                  const line = [f.id, f.reason].join(t("metaSep"));
                  return (
                    <li key={f.id} className="font-mono text-xs">
                      {line}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
