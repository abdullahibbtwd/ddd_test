import {
  ErrorCode,
  ServiceType,
  SubscriptionFrequency,
  todayInSofia,
  type ServiceType as ServiceTypeT,
  type SubscriptionFrequency as SubscriptionFrequencyT,
  type SubscriptionItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getSubscriptionsControllerListQueryKey,
  useSubscriptionsControllerCreate,
  useSubscriptionsControllerList,
  useSubscriptionsControllerUpdate,
} from "@/api/generated/subscriptions/subscriptions";
import { getSitesControllerListQueryKey } from "@/api/generated/sites/sites";
import { isApiRequestError } from "@/api/mutator";
import { CheckboxGroup } from "@/components/checkbox-group";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, controlClassName } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL_SERVICES = Object.values(ServiceType) as ServiceTypeT[];
const ALL_FREQUENCIES = Object.values(SubscriptionFrequency) as SubscriptionFrequencyT[];

type Mode = "read" | "create" | "edit";

export type SitesSubscriptionPanelProps = {
  siteId: string;
  canManage: boolean;
};

export function SitesSubscriptionPanel({ siteId, canManage }: SitesSubscriptionPanelProps) {
  const { t } = useTranslation("sites");
  const { t: te } = useTranslation("errors");
  const queryClient = useQueryClient();

  const listQuery = useSubscriptionsControllerList({ siteId, pageSize: 50 });
  const createMutation = useSubscriptionsControllerCreate();
  const updateMutation = useSubscriptionsControllerUpdate();

  const items = useMemo(
    () => (listQuery.data?.data.items ?? []) as SubscriptionItem[],
    [listQuery.data],
  );

  const today = todayInSofia(new Date());
  const current = useMemo(() => {
    return (
      items.find((s) => s.startDate <= today && (s.endDate === null || s.endDate >= today)) ?? null
    );
  }, [items, today]);

  const history = useMemo(() => {
    return items
      .filter((s) => s.id !== current?.id)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }, [items, current]);

  const [mode, setMode] = useState<Mode>("read");
  const [services, setServices] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<SubscriptionFrequencyT>(
    SubscriptionFrequency.MONTHLY,
  );
  const [rate, setRate] = useState("");
  const [rateIncludesVat, setRateIncludesVat] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [endConfirm, setEndConfirm] = useState(false);
  const [endConfirmDate, setEndConfirmDate] = useState(today);

  useEffect(() => {
    setMode("read");
    setFormError(null);
    setFieldErrors({});
  }, [siteId]);

  function startCreate() {
    setServices([ServiceType.INSECT_CONTROL]);
    setFrequency(SubscriptionFrequency.MONTHLY);
    setRate("");
    setRateIncludesVat(false);
    setStartDate(todayInSofia(new Date()));
    setEndDate("");
    setNotes("");
    setFormError(null);
    setFieldErrors({});
    setMode("create");
  }

  function startEdit() {
    if (!current) return;
    setServices([...current.services]);
    setFrequency(current.frequency);
    setRate(String(current.rate));
    setRateIncludesVat(current.rateIncludesVat);
    setStartDate(current.startDate);
    setEndDate(current.endDate ?? "");
    setNotes(current.notes ?? "");
    setFormError(null);
    setFieldErrors({});
    setMode("edit");
  }

  async function invalidate() {
    await queryClient.invalidateQueries({
      queryKey: getSubscriptionsControllerListQueryKey({ siteId }),
    });
    await queryClient.invalidateQueries({ queryKey: getSitesControllerListQueryKey() });
  }

  function showApiError(err: unknown) {
    if (isApiRequestError(err)) {
      const code = err.code;
      if (code === ErrorCode.SUBSCRIPTION_OVERLAP || code === ErrorCode.SITE_TERMINATED) {
        setFormError(te(code));
        return;
      }
      setFormError(te(code, { defaultValue: te("unknown") }));
      return;
    }
    setFormError(te("unknown"));
  }

  async function handleSave() {
    const nextErrors: Record<string, string> = {};
    if (services.length === 0) {
      nextErrors.services = t("subscription.servicesRequired");
    }
    const rateNum = Number(rate.replace(",", "."));
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      nextErrors.rate = t("subscription.rateInvalid");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      nextErrors.startDate = t("subscription.startRequired");
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormError(null);
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          data: {
            siteId,
            services: services as ServiceTypeT[],
            frequency,
            rate: rateNum,
            rateIncludesVat,
            startDate,
            endDate: endDate || null,
            notes: notes || null,
          },
        });
        toast.success(t("subscription.save"));
      } else if (mode === "edit" && current) {
        await updateMutation.mutateAsync({
          id: current.id,
          data: {
            services: services as ServiceTypeT[],
            frequency,
            rate: rateNum,
            rateIncludesVat,
            startDate,
            endDate: endDate || null,
            notes: notes || null,
          },
        });
        toast.success(t("subscription.save"));
      }
      await invalidate();
      setMode("read");
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleEnd() {
    if (!current) return;
    setFormError(null);
    try {
      await updateMutation.mutateAsync({
        id: current.id,
        data: { endDate: endConfirmDate },
      });
      setEndConfirm(false);
      await invalidate();
      toast.success(t("subscription.endConfirm"));
    } catch (err) {
      showApiError(err);
    }
  }

  const serviceOptions = ALL_SERVICES.map((value) => ({
    value,
    label: t(`subscription.servicesEnum.${value}`),
  }));

  const saving = createMutation.isPending || updateMutation.isPending;

  if (mode === "create" || mode === "edit") {
    return (
      <div className="space-y-4" data-testid="subscription-form">
        {formError ? <p className="text-sm text-bad-ink">{formError}</p> : null}
        <FormField label={t("subscription.services")} required error={fieldErrors.services}>
          <CheckboxGroup
            name="subscription-services"
            options={serviceOptions}
            value={services}
            onChange={setServices}
          />
        </FormField>
        <FormField label={t("subscription.frequency")} required>
          <Select
            value={frequency}
            onValueChange={(v) => setFrequency(v as SubscriptionFrequencyT)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {t(`subscription.frequencies.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("subscription.rate")} required error={fieldErrors.rate}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="num"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="rate-includes-vat"
            checked={rateIncludesVat}
            onCheckedChange={(state) => setRateIncludesVat(state === true)}
          />
          <Label htmlFor="rate-includes-vat" className="font-normal">
            {t("subscription.rateIncludesVat")}
          </Label>
        </div>
        <FormField label={t("subscription.startDate")} required error={fieldErrors.startDate}>
          <input
            type="date"
            className={cn(controlClassName, "h-9")}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>
        <FormField label={t("subscription.endDate")}>
          <input
            type="date"
            className={cn(controlClassName, "h-9")}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </FormField>
        <FormField label={t("subscription.notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </FormField>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {t("subscription.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("read")} disabled={saving}>
            {t("subscription.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="subscription-read">
      {formError ? <p className="text-sm text-bad-ink">{formError}</p> : null}

      {current ? (
        <div className="space-y-3" data-testid="subscription-current">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="label">{t("subscription.services")}</dt>
              <dd className="mt-0.5">
                {current.services.map((s) => t(`subscription.servicesEnum.${s}`)).join(", ")}
              </dd>
            </div>
            <div>
              <dt className="label">{t("subscription.frequency")}</dt>
              <dd className="mt-0.5">{t(`subscription.frequencies.${current.frequency}`)}</dd>
            </div>
            <div>
              <dt className="label">{t("subscription.rate")}</dt>
              <dd className="mt-0.5">
                <span className="num">{formatMoney(current.rate)}</span>
                <span className="ml-2 text-ink-muted">
                  {current.rateIncludesVat
                    ? t("subscription.withVat")
                    : t("subscription.withoutVat")}
                </span>
              </dd>
            </div>
            <div>
              <dt className="label">{t("subscription.period")}</dt>
              <dd className="mt-0.5">
                {t("subscription.periodFrom", { date: formatIsoDate(current.startDate) })}
                {t("subscription.periodSep")}
                {current.endDate
                  ? t("subscription.periodTo", { date: formatIsoDate(current.endDate) })
                  : t("subscription.periodOpen")}
              </dd>
            </div>
            {current.notes ? (
              <div>
                <dt className="label">{t("subscription.notes")}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{current.notes}</dd>
              </div>
            ) : null}
          </dl>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={startEdit}>
                {t("subscription.edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEndConfirmDate(todayInSofia(new Date()));
                  setEndConfirm(true);
                }}
              >
                {t("subscription.end")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3" data-testid="subscription-empty">
          <p className="text-sm text-ink-muted">{t("subscription.empty")}</p>
          {canManage ? (
            <Button type="button" onClick={startCreate}>
              {t("subscription.new")}
            </Button>
          ) : null}
        </div>
      )}

      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="type-section">{t("subscription.history")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("subscription.historyEmpty")}</p>
        ) : (
          <ul className="space-y-3" data-testid="subscription-history">
            {history.map((row) => (
              <li key={row.id} className="text-sm">
                <div>
                  {t("subscription.periodFrom", { date: formatIsoDate(row.startDate) })}
                  {t("subscription.periodSep")}
                  {row.endDate
                    ? t("subscription.periodTo", { date: formatIsoDate(row.endDate) })
                    : t("subscription.periodOpen")}
                </div>
                <div className="text-ink-muted">
                  {t(`subscription.frequencies.${row.frequency}`)}
                  {t("subscription.metaSep")}
                  <span className="num">{formatMoney(row.rate)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={endConfirm}
        onOpenChange={setEndConfirm}
        title={t("subscription.endTitle")}
        description={t("subscription.endDescription")}
        confirmLabel={t("subscription.endConfirm")}
        onConfirm={() => void handleEnd()}
        loading={updateMutation.isPending}
        destructive
      >
        <FormField label={t("subscription.endDate")}>
          <input
            type="date"
            className={cn(controlClassName, "h-9")}
            value={endConfirmDate}
            onChange={(e) => setEndConfirmDate(e.target.value)}
          />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}
