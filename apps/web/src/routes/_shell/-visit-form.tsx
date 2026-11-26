import {
  addCalendarDays,
  EmployeeRoleOnVisit,
  Role,
  ServiceType,
  todayInSofia,
  VisitStatus,
  type ServiceType as ServiceTypeT,
  type VisitItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSitesControllerGetOne } from "@/api/generated/sites/sites";
import { useUsersControllerList } from "@/api/generated/users/users";
import {
  getVisitsControllerListQueryKey,
  useVisitsControllerCancel,
  useVisitsControllerCreate,
  useVisitsControllerUpdate,
} from "@/api/generated/visits/visits";
import { isApiRequestError } from "@/api/mutator";
import { useAbility } from "@/auth/ability";
import { CheckboxGroup } from "@/components/checkbox-group";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { translateApiError } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { VisitProductsPanel } from "./-visit-products-panel";

const ALL_TYPES = Object.values(ServiceType) as ServiceTypeT[];

function newMutationId(): string {
  return crypto.randomUUID();
}

export type VisitFormProps = {
  mode: "create" | "edit";
  siteId: string;
  visit?: VisitItem | null;
};

export function VisitForm({ mode, siteId, visit }: VisitFormProps) {
  const { t } = useTranslation("visits");
  const { t: te } = useTranslation("errors");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ability = useAbility();
  const { user } = useRouteContext({ from: "/_shell" });

  const isField = user?.role === Role.FIELD;
  const canListUsers = ability.can("read", "User") || ability.can("manage", "User");

  const siteQuery = useSitesControllerGetOne(siteId);
  const site = siteQuery.data?.data;
  const siteError = siteQuery.isError;

  const usersQuery = useUsersControllerList(
    { page: 1, pageSize: 100, isActive: true },
    { query: { enabled: canListUsers } },
  );
  const userOptions = useMemo(() => {
    const items = usersQuery.data?.data.items ?? [];
    return items.map((u) => ({ value: u.id, label: u.name }));
  }, [usersQuery.data]);

  const today = todayInSofia(new Date());
  const minDate = isField ? addCalendarDays(today, -7) : undefined;

  const currentSub = site?.currentSubscription ?? null;
  const amountFromSub = currentSub != null;
  const amountReadOnly = amountFromSub && isField;

  const clientMutationId = useRef(newMutationId());

  const [visitDate, setVisitDate] = useState(visit?.visitDate ?? today);
  const [treatmentType, setTreatmentType] = useState<ServiceTypeT>(
    visit?.treatmentType ?? ServiceType.INSECT_CONTROL,
  );
  const [employeeIds, setEmployeeIds] = useState<string[]>(() => {
    if (visit) return visit.employees.map((e) => e.userId);
    return [user.id];
  });
  const [amount, setAmount] = useState(() => {
    if (visit) return String(visit.chargedAmount);
    if (currentSub) return String(currentSub.rate);
    return "";
  });
  const [rateIncludesVat, setRateIncludesVat] = useState(() => {
    if (visit) return visit.rateIncludesVat;
    if (currentSub) return currentSub.rateIncludesVat;
    return false;
  });
  const [notes, setNotes] = useState(visit?.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // When site loads and we are creating with a subscription, copy amount/VAT.
  useEffect(() => {
    if (mode !== "create" || visit) return;
    if (!currentSub) return;
    setAmount(String(currentSub.rate));
    setRateIncludesVat(currentSub.rateIncludesVat);
  }, [mode, visit, currentSub]);

  const createMutation = useVisitsControllerCreate();
  const updateMutation = useVisitsControllerUpdate();
  const cancelMutation = useVisitsControllerCancel();

  const cancelled = visit?.status === VisitStatus.CANCELLED;
  const readOnly = cancelled;

  const goBackToVisitsTab = () => {
    void navigate({
      to: "/sites",
      search: { siteId, tab: "visits" },
    });
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: getVisitsControllerListQueryKey({ siteId }),
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!visitDate) next.visitDate = t("validation.dateRequired");
    if (!amountFromSub && (amount.trim() === "" || Number.isNaN(Number(amount)))) {
      next.amount = t("validation.amountRequired");
    } else if (amount.trim() !== "" && (Number.isNaN(Number(amount)) || Number(amount) < 0)) {
      next.amount = t("validation.amountInvalid");
    }
    if (employeeIds.length === 0) {
      next.employees = t("validation.employeesRequired");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildEmployees = () => {
    // Actor is LEAD by default; others ASSIST. If actor not in list, first selected is LEAD.
    const leadId = employeeIds.includes(user.id) ? user.id : employeeIds[0]!;
    return employeeIds.map((id) => ({
      userId: id,
      role: id === leadId ? EmployeeRoleOnVisit.LEAD : EmployeeRoleOnVisit.ASSIST,
    }));
  };

  const handleSave = async () => {
    if (readOnly || !validate()) return;
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          data: {
            siteId,
            visitDate,
            treatmentType,
            chargedAmount: amountFromSub && isField ? undefined : Number(amount),
            rateIncludesVat: amountFromSub && isField ? undefined : rateIncludesVat,
            employees: buildEmployees(),
            notes: notes.trim() || null,
            clientMutationId: clientMutationId.current,
          },
        });
      } else if (visit) {
        await updateMutation.mutateAsync({
          id: visit.id,
          data: {
            visitDate,
            treatmentType,
            ...(isField
              ? {}
              : {
                  chargedAmount: Number(amount),
                  rateIncludesVat,
                }),
            employees: buildEmployees(),
            notes: notes.trim() || null,
          },
        });
      }
      await invalidate();
      goBackToVisitsTab();
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    }
  };

  const handleCancel = async () => {
    if (!visit || cancelReason.trim().length < 3) {
      toast.error(t("cancelReasonRequired"));
      return;
    }
    try {
      await cancelMutation.mutateAsync({
        id: visit.id,
        data: { cancelReason: cancelReason.trim() },
      });
      setCancelOpen(false);
      await invalidate();
      goBackToVisitsTab();
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    }
  };

  if (siteError) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4" data-testid="visit-site-not-found">
        <p className="text-sm text-ink-muted">{t("siteNotFound")}</p>
        <Button variant="secondary" onClick={() => void navigate({ to: "/sites" })}>
          {t("back")}
        </Button>
      </div>
    );
  }

  if (mode === "edit" && !visit) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4" data-testid="visit-not-found">
        <p className="text-sm text-ink-muted">{t("notFound")}</p>
        <Button variant="secondary" onClick={() => void navigate({ to: "/sites" })}>
          {t("back")}
        </Button>
      </div>
    );
  }

  const saving =
    createMutation.isPending || updateMutation.isPending || cancelMutation.isPending;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4" data-testid="visit-form">
      <div className="flex items-center justify-between gap-3">
        <h1 className="type-section">
          {mode === "create" ? t("createTitle") : t("editTitle")}
        </h1>
        <Button variant="secondary" onClick={goBackToVisitsTab}>
          {t("back")}
        </Button>
      </div>

      <FormField label={t("fields.site")}>
        <Input value={site?.name ?? "…"} readOnly disabled data-testid="visit-site-name" />
      </FormField>

      <FormField label={t("fields.date")} error={fieldErrors.visitDate}>
        <Input
          type="date"
          value={visitDate}
          min={minDate}
          max={today}
          onChange={(e) => setVisitDate(e.target.value)}
          disabled={readOnly}
          data-testid="visit-date"
        />
      </FormField>

      <FormField label={t("fields.treatmentType")}>
        <Select
          value={treatmentType}
          onValueChange={(v) => setTreatmentType(v as ServiceTypeT)}
          disabled={readOnly}
        >
          <SelectTrigger data-testid="visit-treatment-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`treatmentTypes.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="flex flex-col gap-1.5">
        <Label>{t("fields.employees")}</Label>
        {canListUsers ? (
          <CheckboxGroup
            options={userOptions}
            value={employeeIds}
            onChange={setEmployeeIds}
            disabled={readOnly}
          />
        ) : (
          <p className="text-sm text-ink-muted" data-testid="visit-employees-self">
            {user.name} {t("leadSuffix", { role: t("roles.LEAD") })}
          </p>
        )}
        {fieldErrors.employees ? (
          <p role="alert" className="text-xs text-bad-ink">
            {fieldErrors.employees}
          </p>
        ) : null}
      </div>

      <FormField
        label={t("fields.amount")}
        error={fieldErrors.amount}
        hint={amountFromSub ? t("fromSubscription") : undefined}
      >
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num"
          readOnly={amountReadOnly || readOnly}
          disabled={amountReadOnly || readOnly}
          data-testid="visit-amount"
        />
      </FormField>

      <div className="flex items-center gap-2">
        <Checkbox
          id="visit-vat"
          checked={rateIncludesVat}
          onCheckedChange={(v) => setRateIncludesVat(v === true)}
          disabled={amountReadOnly || readOnly}
          data-testid="visit-vat"
        />
        <Label
          htmlFor="visit-vat"
          className={cn((amountReadOnly || readOnly) && "text-ink-muted")}
        >
          {t("fields.rateIncludesVat")}
        </Label>
      </div>

      <FormField label={t("fields.notes")}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={readOnly}
          data-testid="visit-notes"
        />
      </FormField>

      {!readOnly ? (
        <Button className="w-full" onClick={() => void handleSave()} disabled={saving}>
          {t("save")}
        </Button>
      ) : null}

      {mode === "edit" && visit && !cancelled ? (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setCancelOpen(true)}
          disabled={saving}
          data-testid="visit-cancel-open"
        >
          {t("cancelVisit")}
        </Button>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("cancelTitle")}
        description={t("cancelDescription")}
        confirmLabel={t("cancelConfirm")}
        destructive
        loading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
      >
        <FormField label={t("cancelReason")}>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            data-testid="visit-cancel-reason"
          />
        </FormField>
      </ConfirmDialog>

      {mode === "edit" && visit && !cancelled ? (
        <VisitProductsPanel visitId={visit.id} siteId={siteId} />
      ) : null}
    </div>
  );
}
