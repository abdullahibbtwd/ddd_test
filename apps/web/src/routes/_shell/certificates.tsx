import {
  CertificateStatus,
  Role,
  type ClientEmployeeItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouteContext, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getClientEmployeesControllerListQueryKey,
  useClientEmployeesControllerCertificatesForEmployee,
  useClientEmployeesControllerCreate,
  useClientEmployeesControllerErase,
  useClientEmployeesControllerExport,
  useClientEmployeesControllerList,
} from "@/api/generated/client-employees/client-employees";
import { useClientsControllerList } from "@/api/generated/clients/clients";
import { useHealthCertificatesControllerCreate } from "@/api/generated/health-certificates/health-certificates";
import { useSitesControllerList } from "@/api/generated/sites/sites";
import { isApiRequestError } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import {
  ListToolbar,
  listFilterControlClass,
  MobileListCard,
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
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate } from "@/lib/format";
import { translateApiError } from "@/lib/error-message";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/certificates")({
  validateSearch: (search: Record<string, unknown>) => ({
    siteId: typeof search.siteId === "string" ? search.siteId : undefined,
    employeeId: typeof search.employeeId === "string" ? search.employeeId : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    expiringWithin:
      typeof search.expiringWithin === "string"
        ? Number(search.expiringWithin)
        : undefined,
  }),
  component: CertificatesPage,
});

const PAGE_SIZE = 20;

function statusVariant(status: string | null | undefined) {
  if (status === CertificateStatus.CURRENT) return "ok" as const;
  if (status === CertificateStatus.EXPIRING) return "warn" as const;
  if (status === CertificateStatus.EXPIRED) return "bad" as const;
  return "neutral" as const;
}

function CertificatesPage() {
  const { t } = useTranslation("certificates");
  const { t: te } = useTranslation("errors");
  const { user } = useRouteContext({ from: "/_shell" });
  const search = useSearch({ from: "/_shell/certificates" });
  const queryClient = useQueryClient();
  const isAdmin = user.role === Role.ADMIN;

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>(search.status ?? "all");
  const [expiringWithin, setExpiringWithin] = useState<string>(
    search.expiringWithin != null ? String(search.expiringWithin) : "",
  );
  const [selected, setSelected] = useState<ClientEmployeeItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseReason, setEraseReason] = useState("");
  const [eraseError, setEraseError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState(search.siteId ?? "");
  const [notes, setNotes] = useState("");

  const [certLast, setCertLast] = useState("");
  const [certNext, setCertNext] = useState("");

  const listParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      siteId: search.siteId || siteId || undefined,
      status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as "CURRENT" | "EXPIRING" | "EXPIRED"),
      expiringWithin: expiringWithin ? Number(expiringWithin) : undefined,
      includeErased: "true" as const,
    }),
    [page, search.siteId, siteId, statusFilter, expiringWithin],
  );

  const listQuery = useClientEmployeesControllerList(listParams);
  const clientsQuery = useClientsControllerList({ page: 1, pageSize: 100 });
  const sitesQuery = useSitesControllerList({ page: 1, pageSize: 100 });
  const createMutation = useClientEmployeesControllerCreate();
  const eraseMutation = useClientEmployeesControllerErase();
  const certCreateMutation = useHealthCertificatesControllerCreate();
  const exportQuery = useClientEmployeesControllerExport(selected?.id ?? "", {
    query: { enabled: false },
  });
  const certsQuery = useClientEmployeesControllerCertificatesForEmployee(
    selected?.id ?? "",
    { query: { enabled: !!selected } },
  );

  const items = (listQuery.data?.data.items ?? []) as ClientEmployeeItem[];
  const total = listQuery.data?.data.total ?? 0;
  const clients = clientsQuery.data?.data.items ?? [];
  const sites = sitesQuery.data?.data.items ?? [];

  async function handleCreate() {
    try {
      await createMutation.mutateAsync({
        data: {
          clientId,
          fullName,
          jobTitle: jobTitle || null,
          siteId: siteId || null,
          notes: notes || null,
        },
      });
      toast.success(t("toast.created"));
      setCreateOpen(false);
      void queryClient.invalidateQueries({
        queryKey: getClientEmployeesControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  async function handleAddCertificate() {
    if (!selected) return;
    try {
      await certCreateMutation.mutateAsync({
        data: {
          clientEmployeeId: selected.id,
          lastCertifiedAt: certLast,
          nextRenewalAt: certNext,
        },
      });
      toast.success(t("toast.certificateCreated"));
      setCertLast("");
      setCertNext("");
      void certsQuery.refetch();
      void queryClient.invalidateQueries({
        queryKey: getClientEmployeesControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  async function handleErase() {
    if (!selected) return;
    if (eraseReason.trim().length < 3) {
      setEraseError(t("eraseReasonRequired"));
      return;
    }
    try {
      await eraseMutation.mutateAsync({
        id: selected.id,
        data: { reason: eraseReason.trim() },
      });
      toast.success(t("toast.erased"));
      setEraseOpen(false);
      setSelected(null);
      void queryClient.invalidateQueries({
        queryKey: getClientEmployeesControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  async function handleExport() {
    if (!selected) return;
    try {
      const res = await exportQuery.refetch();
      const blob = new Blob([JSON.stringify(res.data?.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${selected.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toast.exported"));
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  const certItems = certsQuery.data?.data.items ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="certificates-page">
      <PageHeader
        title={t("title")}
        actions={
          <PrimaryNewButton
            type="button"
            data-testid="certificates-new"
            onClick={() => setCreateOpen(true)}
          >
            {t("newEmployee")}
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
            <SelectItem value="CURRENT">{t("status.CURRENT")}</SelectItem>
            <SelectItem value="EXPIRING">{t("status.EXPIRING")}</SelectItem>
            <SelectItem value="EXPIRED">{t("status.EXPIRED")}</SelectItem>
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
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.jobTitle")}</TableHead>
              <TableHead>{t("columns.client")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.nextRenewal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                data-testid={`certificate-employee-${item.id}`}
                data-selected={search.employeeId === item.id ? "true" : undefined}
                interactive
                onClick={() => setSelected(item)}
              >
                <TableCell className="font-medium text-[#0F172A]">{item.fullName}</TableCell>
                <TableCell>{item.jobTitle ?? t("emDash")}</TableCell>
                <TableCell>{item.clientName ?? t("emDash")}</TableCell>
                <TableCell>
                  {item.certificateStatus ? (
                    <StatusBadge variant={statusVariant(item.certificateStatus)}>
                      {t(`status.${item.certificateStatus}`)}
                    </StatusBadge>
                  ) : (
                    t("emDash")
                  )}
                </TableCell>
                <TableCell>
                  {item.nextRenewalAt
                    ? formatIsoDate(item.nextRenewalAt)
                    : t("emDash")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          }
          cards={
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <MobileListCard
                    data-testid={`certificate-employee-card-${item.id}`}
                    data-selected={search.employeeId === item.id ? "true" : undefined}
                    onClick={() => setSelected(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold text-[#0F172A]">
                        {item.fullName}
                      </p>
                      {item.certificateStatus ? (
                        <StatusBadge variant={statusVariant(item.certificateStatus)}>
                          {t(`status.${item.certificateStatus}`)}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 truncate text-sm text-[#64748B]">
                      {item.jobTitle ?? t("emDash")} · {item.clientName ?? t("emDash")}
                    </p>
                    <p className="mt-2.5 text-xs tabular-nums text-[#64748B]">
                      {t("columns.nextRenewal")}:{" "}
                      {item.nextRenewalAt ? formatIsoDate(item.nextRenewalAt) : t("emDash")}
                    </p>
                  </MobileListCard>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <Drawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("newEmployee")}
      >
        <div className="flex flex-col gap-3 p-4">
          <FormField label={t("fields.fullName")}>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label={t("fields.jobTitle")}>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </FormField>
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
            <Select value={siteId || "__none"} onValueChange={(v) => setSiteId(v === "__none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("emDash")}</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("fields.notes")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <Button type="button" onClick={() => void handleCreate()} disabled={!clientId || fullName.trim().length < 2}>
            {t("save")}
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.fullName ?? ""}
      >
        {selected ? (
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-ink-muted">
              {selected.jobTitle ?? t("emDash")}
              {t("sep")}
              {selected.clientName ?? t("emDash")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                data-testid="certificates-export"
                onClick={() => void handleExport()}
              >
                {t("export")}
              </Button>
              {isAdmin && !selected.erasedAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="certificates-erase"
                  onClick={() => {
                    setEraseReason("");
                    setEraseError(null);
                    setEraseOpen(true);
                  }}
                >
                  {t("erase")}
                </Button>
              ) : null}
            </div>

            <h3 className="text-sm font-medium">{t("fields.history")}</h3>
            <ul className="flex flex-col gap-2">
              {certItems.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {formatIsoDate(c.lastCertifiedAt)}
                    {t("rangeArrow")}
                    {formatIsoDate(c.nextRenewalAt)}
                  </span>
                  <StatusBadge variant={statusVariant(c.status)}>
                    {t(`status.${c.status}`)}
                  </StatusBadge>
                  {c.documentUrl ? (
                    <a href={c.documentUrl} className="underline" target="_blank" rel="noreferrer">
                      {t("download")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>

            {!selected.erasedAt ? (
              <div className="flex flex-col gap-2 border-t pt-3">
                <FormField label={t("fields.lastCertifiedAt")}>
                  <Input type="date" value={certLast} onChange={(e) => setCertLast(e.target.value)} />
                </FormField>
                <FormField label={t("fields.nextRenewalAt")}>
                  <Input type="date" value={certNext} onChange={(e) => setCertNext(e.target.value)} />
                </FormField>
                <Button type="button" onClick={() => void handleAddCertificate()}>
                  {t("addCertificate")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        title={t("eraseTitle")}
        description={t("eraseBody")}
        confirmLabel={t("eraseConfirm")}
        cancelLabel={t("cancel")}
        onConfirm={() => void handleErase()}
      >
        <FormField label={t("eraseReason")} error={eraseError}>
          <Textarea
            value={eraseReason}
            onChange={(e) => setEraseReason(e.target.value)}
          />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}
