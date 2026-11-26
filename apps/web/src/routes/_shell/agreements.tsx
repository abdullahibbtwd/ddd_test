import {
  addCalendarMonths,
  AgreementStatus,
  ServiceType,
  todayInSofia,
  type AgreementItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getAgreementsControllerListQueryKey,
  useAgreementsControllerCreate,
  useAgreementsControllerList,
  useAgreementsControllerRenew,
} from "@/api/generated/agreements/agreements";
import { useClientsControllerList } from "@/api/generated/clients/clients";
import { useSitesControllerList } from "@/api/generated/sites/sites";
import { isApiRequestError } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import {
  ListToolbar,
  listFilterControlClass,
  PrimaryNewButton,
  ResponsiveList,
} from "@/components/list-chrome";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import { formatIsoDate, formatMoney } from "@/lib/format";
import { translateApiError } from "@/lib/error-message";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/agreements")({
  validateSearch: (search: Record<string, unknown>) => ({
    agreementId: typeof search.agreementId === "string" ? search.agreementId : undefined,
  }),
  component: AgreementsPage,
});

const PAGE_SIZE = 20;
const SERVICES = Object.values(ServiceType);

function statusVariant(status: string) {
  if (status === AgreementStatus.ACTIVE) return "ok" as const;
  if (status === AgreementStatus.EXPIRED) return "bad" as const;
  if (status === AgreementStatus.TERMINATED) return "neutral" as const;
  return "warn" as const;
}

function AgreementsPage() {
  const search = useSearch({ from: "/_shell/agreements" });
  const { t } = useTranslation("agreements");
  const { t: te } = useTranslation("errors");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiringWithin, setExpiringWithin] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<AgreementItem | null>(null);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [serviceType, setServiceType] = useState<string>(ServiceType.INSECT_CONTROL);
  const [signedAt, setSignedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [contractValue, setContractValue] = useState("");

  const listParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as
              | "ACTIVE"
              | "EXPIRED"
              | "TERMINATED"
              | "RENEWED"),
      expiringWithin: expiringWithin ? Number(expiringWithin) : undefined,
    }),
    [page, statusFilter, expiringWithin],
  );

  const listQuery = useAgreementsControllerList(listParams);
  const clientsQuery = useClientsControllerList({ page: 1, pageSize: 100 });
  const sitesQuery = useSitesControllerList({ page: 1, pageSize: 100 });
  const createMutation = useAgreementsControllerCreate();
  const renewMutation = useAgreementsControllerRenew();

  const items = (listQuery.data?.data.items ?? []) as AgreementItem[];
  const total = listQuery.data?.data.total ?? 0;
  const clients = clientsQuery.data?.data.items ?? [];
  const sites = sitesQuery.data?.data.items ?? [];

  const renewSignedAt = todayInSofia(new Date());
  const renewExpiresAt = renewTarget
    ? addCalendarMonths(renewTarget.expiresAt, 12)
    : "";

  async function handleCreate() {
    try {
      await createMutation.mutateAsync({
        data: {
          clientId,
          siteId,
          serviceType: serviceType as (typeof SERVICES)[number],
          signedAt,
          expiresAt,
          contractValue,
        },
      });
      toast.success(t("toast.created"));
      setCreateOpen(false);
      void queryClient.invalidateQueries({
        queryKey: getAgreementsControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  async function handleRenew() {
    if (!renewTarget) return;
    try {
      await renewMutation.mutateAsync({
        id: renewTarget.id,
        data: { newSignedAt: renewSignedAt, newExpiresAt: renewExpiresAt },
      });
      toast.success(t("toast.renewed"));
      setRenewTarget(null);
      void queryClient.invalidateQueries({
        queryKey: getAgreementsControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="agreements-page">
      <PageHeader
        title={t("title")}
        actions={
          <PrimaryNewButton
            type="button"
            data-testid="agreements-new"
            onClick={() => setCreateOpen(true)}
          >
            {t("new")}
          </PrimaryNewButton>
        }
      />

      <ListToolbar>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className={cn(listFilterControlClass, "w-full sm:w-44")}
            aria-label={t("filters.status")}
          >
            <SelectValue placeholder={t("filters.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
            {Object.values(AgreementStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className={cn(listFilterControlClass, "w-full sm:w-44")}
          placeholder={t("filters.expiringWithin")}
          aria-label={t("filters.expiringWithin")}
          value={expiringWithin}
          onChange={(e) => setExpiringWithin(e.target.value)}
        />
      </ListToolbar>

      {items.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ResponsiveList
          table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.client")}</TableHead>
              <TableHead>{t("columns.site")}</TableHead>
              <TableHead>{t("columns.expiresAt")}</TableHead>
              <TableHead numeric>{t("columns.value")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                data-testid={`agreement-row-${item.id}`}
                data-selected={search.agreementId === item.id ? "true" : undefined}
              >
                <TableCell className="font-medium text-[#0F172A]">{item.clientName ?? t("emDash")}</TableCell>
                <TableCell>{item.siteName ?? t("emDash")}</TableCell>
                <TableCell>{formatIsoDate(item.expiresAt)}</TableCell>
                <TableCell numeric>{formatMoney(Number(item.contractValue))}</TableCell>
                <TableCell>
                  <StatusBadge variant={statusVariant(item.status)}>
                    {t(`status.${item.status}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  {item.storedStatus === AgreementStatus.ACTIVE ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="agreements-renew"
                      onClick={() => setRenewTarget(item)}
                    >
                      {t("renew")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          }
          cards={
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  data-selected={search.agreementId === item.id ? "true" : undefined}
                  className="rounded-xl border border-[#E2E8F0] bg-[#ffffff] p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-[#0F172A]">
                      {item.clientName ?? t("emDash")}
                    </p>
                    <StatusBadge variant={statusVariant(item.status)}>
                      {t(`status.${item.status}`)}
                    </StatusBadge>
                  </div>
                  <p className="mt-1.5 truncate text-sm text-[#64748B]">
                    {item.siteName ?? t("emDash")}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="text-xs tabular-nums text-[#64748B]">
                      {formatIsoDate(item.expiresAt)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-[#0F172A]">
                      {formatMoney(Number(item.contractValue))}
                    </span>
                  </div>
                  {item.storedStatus === AgreementStatus.ACTIVE ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full"
                      data-testid="agreements-renew-mobile"
                      onClick={() => setRenewTarget(item)}
                    >
                      {t("renew")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <Drawer open={createOpen} onOpenChange={setCreateOpen} title={t("new")}>
        <div className="flex flex-col gap-3 p-4">
          <FormField label={t("fields.client")}>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("fields.site")}>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("fields.serviceType")}>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("fields.signedAt")}>
            <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </FormField>
          <FormField label={t("fields.expiresAt")}>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </FormField>
          <FormField label={t("fields.contractValue")}>
            <Input value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
          </FormField>
          <Button type="button" onClick={() => void handleCreate()}>
            {t("save")}
          </Button>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!renewTarget}
        onOpenChange={(open) => {
          if (!open) setRenewTarget(null);
        }}
        title={t("renewTitle")}
        description={t("renewBody")}
        confirmLabel={t("renewConfirm")}
        cancelLabel={t("cancel")}
        onConfirm={() => void handleRenew()}
      >
        {renewTarget ? (
          <dl className="grid grid-cols-2 gap-2 text-sm" data-testid="agreements-renew-dialog">
            <dt>{t("fields.signedAt")}</dt>
            <dd data-testid="renew-signed-at">{formatIsoDate(renewSignedAt)}</dd>
            <dt>{t("fields.expiresAt")}</dt>
            <dd data-testid="renew-expires-at">{formatIsoDate(renewExpiresAt)}</dd>
            <dt>{t("fields.contractValue")}</dt>
            <dd>{formatMoney(Number(renewTarget.contractValue))}</dd>
          </dl>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
