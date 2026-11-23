import {
  ClientKind,
  CreateClientBodySchema,
  ErrorCode,
  formatPhone,
  PaymentMethod,
  PhoneValidationError,
  SiteStatus,
  UpdateClientBodySchema,
  validateEik,
  validateVatNumber,
  type ClientDuplicateCandidate,
  type ClientItem,
  type ClientListQuery,
  type CreateClientBody,
  type DuplicateEikDetails,
  type PaymentMethod as PaymentMethodType,
  type SiteListItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  clientsControllerGetOne,
  getClientsControllerListQueryKey,
  useClientsControllerCreate,
  useClientsControllerDuplicates,
  useClientsControllerList,
  useClientsControllerUpdate,
} from "@/api/generated/clients/clients";
import { useSitesControllerList } from "@/api/generated/sites/sites";
import { isApiRequestError } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { buildDuplicateUiState } from "./clients-duplicates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/clients")({
  component: ClientsPage,
});

const PAGE_SIZE = 20;
const PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD,
  PaymentMethod.OTHER,
] as const;

type DrawerTarget = { mode: "create" } | { mode: "edit"; item: ClientItem };

function formatPhoneCell(phone: string | null, emDash: string): string {
  if (!phone) return emDash;
  try {
    return formatPhone(phone);
  } catch (err) {
    if (err instanceof PhoneValidationError) return phone;
    return emDash;
  }
}

function ClientsPage() {
  const { t } = useTranslation("clients");
  const { t: tc } = useTranslation("common");
  const { t: te } = useTranslation("errors");
  const { t: ts } = useTranslation("sites");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"data" | "sites">("data");

  const [kind, setKind] = useState<typeof ClientKind.COMPANY | typeof ClientKind.INDIVIDUAL>(
    ClientKind.COMPANY,
  );
  const [name, setName] = useState("");
  const [eik, setEik] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [legalRepresentative, setLegalRepresentative] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | PaymentMethodType>("");
  const [notes, setNotes] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [raceDuplicateName, setRaceDuplicateName] = useState<string | null>(null);
  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedEik, setDebouncedEik] = useState("");

  const listQuery = useMemo((): ClientListQuery => {
    const q: ClientListQuery = { page, pageSize: PAGE_SIZE, isActive: true };
    if (search.trim()) q.search = search.trim();
    if (kindFilter === ClientKind.COMPANY || kindFilter === ClientKind.INDIVIDUAL) {
      q.kind = kindFilter;
    }
    if (statusFilter === "active") q.isActive = true;
    else if (statusFilter === "archived") q.isActive = false;
    else if (statusFilter === "all") q.isActive = undefined;
    return q;
  }, [page, search, kindFilter, statusFilter]);

  const { data, isLoading, isError } = useClientsControllerList(listQuery);
  const createMutation = useClientsControllerCreate();
  const updateMutation = useClientsControllerUpdate();

  const items = (data?.data.items ?? []) as ClientItem[];
  const total = data?.data.total ?? 0;

  const drawerOpen = drawerTarget !== null;
  const isCreate = drawerTarget?.mode === "create";
  const editing = drawerTarget?.mode === "edit" ? drawerTarget.item : null;

  const editingClientId = drawerTarget?.mode === "edit" ? drawerTarget.item.id : "";
  const { data: clientSitesData } = useSitesControllerList(
    {
      page: 1,
      pageSize: 50,
      clientId: editingClientId || undefined,
      status: "ALL",
    },
    { query: { enabled: drawerOpen && drawerTab === "sites" && editingClientId.length > 0 } },
  );
  const clientSites = (clientSitesData?.data.items ?? []) as SiteListItem[];

  useEffect(() => {
    if (!drawerTarget) return;
    setFieldErrors({});
    setRaceDuplicateName(null);
    setDrawerTab("data");
    if (drawerTarget.mode === "create") {
      setKind(ClientKind.COMPANY);
      setName("");
      setEik("");
      setVatNumber("");
      setRegisteredAddress("");
      setLegalRepresentative("");
      setPhone("");
      setEmail("");
      setPaymentMethod("");
      setNotes("");
      return;
    }
    const item = drawerTarget.item;
    setKind(item.kind);
    setName(item.name);
    setEik(item.eik ?? "");
    setVatNumber(item.vatNumber ?? "");
    setRegisteredAddress(item.registeredAddress ?? "");
    setLegalRepresentative(item.legalRepresentative ?? "");
    setPhone(item.phone ?? "");
    setEmail(item.email ?? "");
    setPaymentMethod(item.preferredPaymentMethod ?? "");
    setNotes(item.notes ?? "");
  }, [drawerTarget]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedName(name), 400);
    return () => window.clearTimeout(handle);
  }, [name]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedEik(eik), 400);
    return () => window.clearTimeout(handle);
  }, [eik]);

  const duplicatesEnabled = drawerOpen && (debouncedName.trim().length > 0 || debouncedEik.trim().length > 0);
  const { data: duplicatesData } = useClientsControllerDuplicates(
    {
      name: debouncedName.trim() || undefined,
      eik: debouncedEik.trim() || undefined,
      excludeId: editing?.id,
    },
    { query: { enabled: duplicatesEnabled } },
  );

  const candidates = (duplicatesData?.data.items ?? []) as ClientDuplicateCandidate[];
  const duplicateUi = buildDuplicateUiState(candidates, raceDuplicateName);

  function showApiError(err: unknown) {
    if (isApiRequestError(err)) {
      if (err.code === ErrorCode.DUPLICATE_EIK) {
        const details = err.details as DuplicateEikDetails | undefined;
        setRaceDuplicateName(details?.existingName ?? t("emDash"));
        return;
      }
      if (err.code === ErrorCode.CLIENT_HAS_ACTIVE_SITES) {
        toast.error(te("CLIENT_HAS_ACTIVE_SITES"));
        return;
      }
      toast.error(te(err.code, { defaultValue: err.message }));
      return;
    }
    toast.error(te("unknown"));
  }

  function validateLocal(): boolean {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim().replace(/\s+/g, " ");
    if (!trimmedName) errors.name = t("validation.nameRequired");

    if (kind === ClientKind.COMPANY) {
      if (!eik.trim()) errors.eik = t("validation.eikRequired");
      else if (!validateEik(eik.trim())) errors.eik = t("validation.eikInvalid");
    } else if (eik.trim() && !validateEik(eik.trim())) {
      errors.eik = t("validation.eikInvalid");
    }

    if (vatNumber.trim()) {
      const upper = vatNumber.trim().toUpperCase();
      if (!validateVatNumber(upper)) errors.vatNumber = t("validation.vatInvalid");
    }

    if (email.trim()) {
      const parsed = CreateClientBodySchema.safeParse({
        kind: ClientKind.INDIVIDUAL,
        name: "x",
        email: email.trim(),
      });
      if (!parsed.success) {
        const issue = parsed.error.issues.find((i) => i.path[0] === "email");
        if (issue) errors.email = t("validation.emailInvalid");
      }
    }

    if (phone.trim() && !/^[\d+\s()-]+$/.test(phone.trim())) {
      errors.phone = t("validation.phoneInvalid");
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validateLocal()) return;
    if (duplicateUi.saveBlocked) return;

    const payload: CreateClientBody = {
      kind,
      name: name.trim().replace(/\s+/g, " "),
      eik: eik.trim() ? eik.trim() : null,
      vatNumber: vatNumber.trim() ? vatNumber.trim().toUpperCase() : null,
      registeredAddress: registeredAddress.trim() ? registeredAddress.trim() : null,
      legalRepresentative:
        kind === ClientKind.COMPANY && legalRepresentative.trim()
          ? legalRepresentative.trim()
          : null,
      phone: phone.trim() ? phone.trim() : null,
      email: email.trim() ? email.trim().toLowerCase() : null,
      preferredPaymentMethod: paymentMethod === "" ? null : paymentMethod,
      notes: notes.trim() ? notes.trim() : null,
    };

    const schema = isCreate ? CreateClientBodySchema : UpdateClientBodySchema;
    const parsed = schema.safeParse(isCreate ? payload : payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "name");
        if (issue.message === ErrorCode.INVALID_EIK) next[key] = t("validation.eikInvalid");
        else if (key === "email") next[key] = t("validation.emailInvalid");
        else if (key === "vatNumber") next[key] = t("validation.vatInvalid");
        else if (key === "name") next[key] = t("validation.nameRequired");
      }
      setFieldErrors(next);
      return;
    }

    try {
      if (isCreate) {
        await createMutation.mutateAsync({ data: parsed.data as CreateClientBody });
      } else if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: parsed.data,
        });
      }
      await queryClient.invalidateQueries({ queryKey: getClientsControllerListQueryKey() });
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleArchiveToggle() {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        data: { isActive: !editing.isActive },
      });
      await queryClient.invalidateQueries({ queryKey: getClientsControllerListQueryKey() });
      setArchiveConfirm(false);
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  function openCandidate(id: string) {
    if (id === "race") return;
    const found = items.find((i) => i.id === id);
    if (found) {
      setDrawerTarget({ mode: "edit", item: found });
      return;
    }
    void (async () => {
      try {
        const res = await clientsControllerGetOne(id);
        setDrawerTarget({ mode: "edit", item: res.data as ClientItem });
      } catch {
        /* ignore — user can search manually */
      }
    })();
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const eikError =
    fieldErrors.eik ??
    (duplicateUi.sameEik
      ? t("duplicates.sameEik", { name: duplicateUi.sameEik.name })
      : undefined);

  return (
    <div>
      <PageHeader
        title={t("title")}
        actions={
          <Button onClick={() => setDrawerTarget({ mode: "create" })}>{t("newClient")}</Button>
        }
      />

      <FilterBar>
        <div className="space-y-1.5">
          <Label htmlFor="clients-search">{t("filters.search")}</Label>
          <Input
            id="clients-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("filters.searchPlaceholder")}
            className="w-56"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("filters.kind")}</Label>
          <Select
            value={kindFilter || "__all"}
            onValueChange={(v) => {
              setKindFilter(v === "__all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("filters.kindAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("filters.kindAll")}</SelectItem>
              <SelectItem value={ClientKind.COMPANY}>{t("filters.kindCompany")}</SelectItem>
              <SelectItem value={ClientKind.INDIVIDUAL}>{t("filters.kindIndividual")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("filters.status")}</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("filters.statusActive")}</SelectItem>
              <SelectItem value="archived">{t("filters.statusArchived")}</SelectItem>
              <SelectItem value="all">{t("filters.statusAll")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      {isLoading ? (
        <p className="text-sm text-ink-muted">{t("empty")}</p>
      ) : isError || items.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead numeric>{t("columns.eik")}</TableHead>
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead numeric className="hidden min-[640px]:table-cell">
                  {t("columns.phone")}
                </TableHead>
                <TableHead numeric className="hidden min-[640px]:table-cell">
                  {t("columns.sites")}
                </TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow
                  key={row.id}
                  interactive
                  onClick={() => setDrawerTarget({ mode: "edit", item: row })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDrawerTarget({ mode: "edit", item: row });
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <TableCell>{row.name}</TableCell>
                  <TableCell numeric className="font-mono text-sm">
                    {row.eik ?? t("emDash")}
                  </TableCell>
                  <TableCell>{t(`kind.${row.kind}`)}</TableCell>
                  <TableCell numeric className="hidden min-[640px]:table-cell">
                    {formatPhoneCell(row.phone, t("emDash"))}
                  </TableCell>
                  <TableCell numeric className="num hidden min-[640px]:table-cell">
                    {row.activeSiteCount}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={row.isActive ? "ok" : "neutral"}>
                      {row.isActive ? t("status.active") : t("status.archived")}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) setDrawerTarget(null);
        }}
        title={isCreate ? t("drawer.createTitle") : t("drawer.editTitle")}
        footer={
          drawerTab === "data" ? (
            <Button
              className="w-full"
              onClick={() => void handleSave()}
              disabled={saving || duplicateUi.saveBlocked || (editing !== null && !editing.isActive)}
            >
              {tc("actions.save")}
            </Button>
          ) : null
        }
      >
        <div className="space-y-6">
          {!isCreate ? (
            <div className="flex gap-4 text-sm">
              <button
                type="button"
                className={cn(
                  "text-ink-muted",
                  drawerTab === "data" && "text-ink underline underline-offset-4",
                )}
                onClick={() => setDrawerTab("data")}
              >
                {t("tabs.data")}
              </button>
              <button
                type="button"
                className={cn(
                  "text-ink-muted",
                  drawerTab === "sites" && "text-ink underline underline-offset-4",
                )}
                onClick={() => setDrawerTab("sites")}
              >
                {t("tabs.sites")}
              </button>
            </div>
          ) : null}

          {drawerTab === "sites" && editing ? (
            <section className="space-y-3">
              <Button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/sites",
                    search: { new: "1", clientId: editing.id },
                  })
                }
              >
                {t("sitesTab.newSite")}
              </Button>
              {clientSites.length === 0 ? (
                <EmptyState message={t("sitesTab.empty")} />
              ) : (
                <ul className="divide-y divide-border border border-border">
                  {clientSites.map((site) => (
                    <li key={site.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left hover:bg-accent-tint"
                        onClick={() =>
                          void navigate({
                            to: "/sites",
                            search: { siteId: site.id },
                          })
                        }
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>{site.name}</span>
                          <StatusBadge
                            variant={site.status === SiteStatus.ACTIVE ? "ok" : "neutral"}
                          >
                            {ts(`status.${site.status}`)}
                          </StatusBadge>
                        </span>
                        <span className="text-sm text-ink-muted">{site.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {drawerTab === "data" ? (
          <>
          <section className="space-y-4">
            <h2 className="type-section">{t("drawer.sectionBasics")}</h2>
            <FormField label={t("drawer.kind")} required>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as typeof kind)}
                disabled={editing !== null && !editing.isActive}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ClientKind.COMPANY}>{t("kind.COMPANY")}</SelectItem>
                  <SelectItem value={ClientKind.INDIVIDUAL}>{t("kind.INDIVIDUAL")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label={kind === ClientKind.COMPANY ? t("drawer.nameCompany") : t("drawer.nameIndividual")}
              required
              error={fieldErrors.name}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
            {duplicateUi.similarNames.length > 0 ? (
              <div className="space-y-1.5 bg-warn-bg px-3 py-2 text-sm text-warn-ink">
                <p>{t("duplicates.similarTitle")}</p>
                <ul className="space-y-1">
                  {duplicateUi.similarNames.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-2">
                      <span>{c.name}</span>
                      <span className="font-mono text-xs">{c.eik ?? t("emDash")}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1 py-0 text-warn-ink underline"
                        onClick={() => openCandidate(c.id)}
                      >
                        {t("open")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <FormField
              label={t("drawer.eik")}
              required={kind === ClientKind.COMPANY}
              error={
                eikError ? (
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span>{eikError}</span>
                    {duplicateUi.sameEik && duplicateUi.sameEik.id !== "race" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1 py-0 text-bad-ink underline"
                        onClick={() => openCandidate(duplicateUi.sameEik!.id)}
                      >
                        {t("open")}
                      </Button>
                    ) : null}
                  </span>
                ) : undefined
              }
            >
              <Input
                value={eik}
                onChange={(e) => {
                  setEik(e.target.value);
                  setRaceDuplicateName(null);
                }}
                className="font-mono"
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
            <FormField label={t("drawer.vatNumber")} error={fieldErrors.vatNumber}>
              <Input
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                className="font-mono"
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
            <FormField label={t("drawer.registeredAddress")}>
              <Textarea
                value={registeredAddress}
                onChange={(e) => setRegisteredAddress(e.target.value)}
                rows={2}
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
            {kind === ClientKind.COMPANY ? (
              <FormField label={t("drawer.legalRepresentative")}>
                <Input
                  value={legalRepresentative}
                  onChange={(e) => setLegalRepresentative(e.target.value)}
                  disabled={editing !== null && !editing.isActive}
                />
              </FormField>
            ) : null}
          </section>

          <section className="space-y-4">
            <h2 className="type-section">{t("drawer.sectionContacts")}</h2>
            <FormField label={t("drawer.phone")} error={fieldErrors.phone}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
            <FormField label={t("drawer.email")} error={fieldErrors.email}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
            <FormField label={t("drawer.paymentMethod")}>
              <Select
                value={paymentMethod || "__none"}
                onValueChange={(v) => setPaymentMethod(v === "__none" ? "" : (v as PaymentMethodType))}
                disabled={editing !== null && !editing.isActive}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("drawer.paymentMethodNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("drawer.paymentMethodNone")}</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`paymentMethod.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("drawer.notes")}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={editing !== null && !editing.isActive}
              />
            </FormField>
          </section>
          </>
          ) : null}

          {drawerTab === "data" && editing ? (
            <section className="space-y-3 border-t border-border pt-4">
              <h2 className="type-section">{t("drawer.actionsSection")}</h2>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setArchiveConfirm(true)}
              >
                {editing.isActive ? t("drawer.archive") : t("drawer.activate")}
              </Button>
            </section>
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        open={archiveConfirm}
        onOpenChange={setArchiveConfirm}
        title={
          editing?.isActive
            ? t("confirm.archiveTitle")
            : t("confirm.activateTitle")
        }
        description={
          editing?.isActive
            ? t("confirm.archiveDescription", { name: editing?.name ?? "" })
            : t("confirm.activateDescription", { name: editing?.name ?? "" })
        }
        onConfirm={() => void handleArchiveToggle()}
        loading={updateMutation.isPending}
      />
    </div>
  );
}
