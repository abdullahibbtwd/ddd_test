import {
  buildNavigationUrl,
  ClientKind,
  ErrorCode,
  Role,
  SiteStatus,
  validateEik,
  type ClientDuplicateCandidate,
  type DuplicateEikDetails,
  type SiteItem,
  type SiteListItem,
  type SiteListQuery,
  type SiteMapItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAreasControllerList } from "@/api/generated/areas/areas";
import {
  useClientsControllerDuplicates,
  useClientsControllerList,
} from "@/api/generated/clients/clients";
import { useSiteTypesControllerList } from "@/api/generated/site-types/site-types";
import {
  getSitesControllerListQueryKey,
  getSitesControllerMapQueryKey,
  sitesControllerGetOne,
  useCertifiedEmployeesControllerCertifiedEmployees,
  useCertifiedEmployeesControllerCounts,
  useSitesControllerCreate,
  useSitesControllerDuplicates,
  useSitesControllerList,
  useSitesControllerMap,
  useSitesControllerUpdate,
} from "@/api/generated/sites/sites";
import { getSubscriptionsControllerListQueryKey } from "@/api/generated/subscriptions/subscriptions";
import { isApiRequestError } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import {
  ListSearchInput,
  listFilterControlClass,
  MobileListCard,
  PrimaryNewButton,
  ResponsiveList,
  SoftPill,
} from "@/components/list-chrome";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
import { SiteLocationPicker, SitesMap } from "@/components/sites-map";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildDuplicateUiState } from "./-clients-duplicates";
import { SitesSubscriptionPanel } from "./-sites-subscription-panel";
import { SitesVisitsPanel } from "./-sites-visits-panel";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type DrawerTarget =
  | { mode: "create"; clientId?: string }
  | { mode: "edit"; item: SiteItem | SiteListItem };

export function SitesPage() {
  const { t } = useTranslation("sites");
  const { t: tc } = useTranslation("common");
  const { t: te } = useTranslation("errors");
  const { user } = useRouteContext({ from: "/_shell" });
  const searchParams = useSearch({ from: "/_shell/sites" });
  const queryClient = useQueryClient();
  const isField = user.role === Role.FIELD;
  const canManage = user.role === Role.ADMIN || user.role === Role.OFFICE;

  const [view, setView] = useState<"list" | "map">("list");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [areaId, setAreaId] = useState("");
  const [siteTypeId, setSiteTypeId] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [statusConfirm, setStatusConfirm] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"data" | "visits" | "subscription">("data");

  // Form state
  const [clientTab, setClientTab] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientLabel, setClientLabel] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [newKind, setNewKind] = useState<typeof ClientKind.COMPANY | typeof ClientKind.INDIVIDUAL>(
    ClientKind.COMPANY,
  );
  const [newClientName, setNewClientName] = useState("");
  const [newEik, setNewEik] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [name, setName] = useState("");
  const [formAreaId, setFormAreaId] = useState("");
  const [formTypeId, setFormTypeId] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [floorArea, setFloorArea] = useState("");
  const [points, setPoints] = useState("0");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [geoError, setGeoError] = useState<string | null>(null);
  const [raceDuplicateName, setRaceDuplicateName] = useState<string | null>(null);
  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedEik, setDebouncedEik] = useState("");
  const [debouncedAddress, setDebouncedAddress] = useState("");
  const [eikNoDetails, setEikNoDetails] = useState(false);

  const listQuery = useMemo((): SiteListQuery => {
    const q: SiteListQuery = {
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter === "ALL" ? "ALL" : (statusFilter as "ACTIVE" | "TERMINATED"),
      hasSubscription: searchParams.hasSubscription,
    };
    if (search.trim()) q.search = search.trim();
    if (areaId) q.areaId = areaId;
    if (siteTypeId) q.siteTypeId = siteTypeId;
    return q;
  }, [page, search, areaId, siteTypeId, statusFilter, searchParams.hasSubscription]);

  const mapQuery = useMemo(
    () => ({
      search: search.trim() || undefined,
      areaId: areaId || undefined,
      siteTypeId: siteTypeId || undefined,
      status: (statusFilter === "ALL" ? "ALL" : statusFilter) as "ACTIVE" | "TERMINATED" | "ALL",
    }),
    [search, areaId, siteTypeId, statusFilter],
  );

  const { data, isLoading, isError } = useSitesControllerList(listQuery, {
    query: { enabled: view === "list" },
  });
  const { data: mapData } = useSitesControllerMap(mapQuery, {
    query: { enabled: view === "map" },
  });
  const { data: typesData } = useSiteTypesControllerList();
  const { data: areasData } = useAreasControllerList({ page: 1, pageSize: 100, isActive: true });

  const createMutation = useSitesControllerCreate();
  const updateMutation = useSitesControllerUpdate();

  const items = (data?.data.items ?? []) as SiteListItem[];
  const total = data?.data.total ?? 0;
  const mapItems = (mapData?.data.items ?? []) as SiteMapItem[];
  const mapTruncated = mapData?.data.truncated ?? false;
  const siteTypes = useMemo(() => typesData?.data.items ?? [], [typesData?.data.items]);
  const areas = useMemo(() => areasData?.data.items ?? [], [areasData?.data.items]);
  const fieldAreas = useMemo(
    () => (isField ? areas.filter((a) => user.areas.some((ua) => ua.id === a.id)) : areas),
    [areas, isField, user.areas],
  );
  const defaultAreaId = fieldAreas[0]?.id ?? "";
  const defaultTypeId = siteTypes[0]?.id ?? "";

  const drawerOpen = drawerTarget !== null;
  const isCreate = drawerTarget?.mode === "create";
  const editing = drawerTarget?.mode === "edit" ? drawerTarget.item : null;
  const readOnly = isField && !isCreate;
  const noFieldAreas = isField && fieldAreas.length === 0;

  const { data: clientsSearchData, isFetching: clientsLoading } = useClientsControllerList(
    { page: 1, pageSize: 10, search: clientSearch.trim() || undefined, isActive: true },
    { query: { enabled: drawerOpen && isCreate && clientTab === "existing" } },
  );
  const clientOptions: SearchSelectOption[] = (clientsSearchData?.data.items ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.eik,
  }));

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedName(newClientName), 400);
    return () => window.clearTimeout(handle);
  }, [newClientName]);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedEik(newEik), 400);
    return () => window.clearTimeout(handle);
  }, [newEik]);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedAddress(address), 400);
    return () => window.clearTimeout(handle);
  }, [address]);

  const dupClientId = isCreate
    ? clientTab === "existing"
      ? clientId
      : null
    : editing && "client" in editing
      ? editing.client.id
      : null;

  const { data: siteDupData } = useSitesControllerDuplicates(
    {
      clientId: dupClientId ?? "00000000-0000-7000-8000-000000000000",
      address: debouncedAddress.trim(),
      excludeId: editing?.id,
    },
    {
      query: {
        enabled:
          drawerOpen &&
          !!dupClientId &&
          debouncedAddress.trim().length > 2 &&
          (!readOnly || isCreate),
      },
    },
  );

  const { data: clientDupData } = useClientsControllerDuplicates(
    {
      name: debouncedName.trim() || undefined,
      eik: debouncedEik.trim() || undefined,
    },
    {
      query: {
        enabled:
          drawerOpen &&
          isCreate &&
          clientTab === "new" &&
          (debouncedName.trim().length > 0 || debouncedEik.trim().length > 0),
      },
    },
  );

  const clientDupUi = buildDuplicateUiState(
    (clientDupData?.data.items ?? []) as ClientDuplicateCandidate[],
    raceDuplicateName,
  );
  const addressDupes = siteDupData?.data.items ?? [];

  const resetForm = useCallback(() => {
    setClientTab("existing");
    setClientId(null);
    setClientLabel("");
    setClientSearch("");
    setNewKind(ClientKind.COMPANY);
    setNewClientName("");
    setNewEik("");
    setNewPhone("");
    setName("");
    setFormAreaId(defaultAreaId);
    setFormTypeId(defaultTypeId);
    setAddress("");
    setLatitude(null);
    setLongitude(null);
    setContactPerson("");
    setContactPhone("");
    setFloorArea("");
    setPoints("0");
    setNotes("");
    setFieldErrors({});
    setGeoError(null);
    setRaceDuplicateName(null);
    setEikNoDetails(false);
  }, [defaultAreaId, defaultTypeId]);

  useEffect(() => {
    if (!drawerTarget) return;
    if (drawerTarget.mode === "create") {
      setDrawerTab("data");
      resetForm();
      if (drawerTarget.clientId) {
        setClientTab("existing");
        setClientId(drawerTarget.clientId);
      }
      return;
    }
    setDrawerTab(
      searchParams.tab === "visits" || searchParams.tab === "subscription"
        ? searchParams.tab
        : "data",
    );
    const item = drawerTarget.item;
    void (async () => {
      let full: SiteItem;
      if ("contactPerson" in item) {
        full = item as SiteItem;
      } else {
        const res = await sitesControllerGetOne(item.id);
        full = res.data as SiteItem;
      }
      setClientId(full.client.id);
      setClientLabel(full.client.name);
      setName(full.name);
      setFormAreaId(full.area.id);
      setFormTypeId(full.type.id);
      setAddress(full.address);
      setLatitude(full.latitude);
      setLongitude(full.longitude);
      setContactPerson(full.contactPerson ?? "");
      setContactPhone(full.contactPhone ?? "");
      setFloorArea(full.floorAreaM2 != null ? String(full.floorAreaM2) : "");
      setPoints(String(full.monitoringPointsCount));
      setNotes(full.notes ?? "");
      setFieldErrors({});
    })();
    // Intentionally omit resetForm: re-running when default area/type ids refresh would loop.
  }, [drawerTarget]);

  // Apply defaults once lists load if create drawer opened early.
  useEffect(() => {
    if (drawerTarget?.mode !== "create") return;
    if (!formTypeId && defaultTypeId) setFormTypeId(defaultTypeId);
    if (!formAreaId && defaultAreaId) setFormAreaId(defaultAreaId);
  }, [drawerTarget, formTypeId, formAreaId, defaultTypeId, defaultAreaId]);

  // Deep-link: ?new=1&clientId= / ?siteId=
  useEffect(() => {
    if (searchParams.siteId) {
      void sitesControllerGetOne(searchParams.siteId)
        .then((res) => setDrawerTarget({ mode: "edit", item: res.data as SiteItem }))
        .catch(() => undefined);
    } else if (searchParams.new === "1") {
      setDrawerTarget({ mode: "create", clientId: searchParams.clientId });
    }
  }, [searchParams.new, searchParams.clientId, searchParams.siteId]);

  function showApiError(err: unknown) {
    if (isApiRequestError(err)) {
      if (err.code === ErrorCode.DUPLICATE_EIK) {
        const details = err.details as DuplicateEikDetails | undefined;
        if (!details) {
          setEikNoDetails(true);
          return;
        }
        setRaceDuplicateName(details.existingName);
        setEikNoDetails(false);
        return;
      }
      toast.error(te(err.code, { defaultValue: err.message }));
      return;
    }
    toast.error(te("unknown"));
  }

  function validateLocal(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = t("validation.nameRequired");
    if (!address.trim()) errors.address = t("validation.addressRequired");
    if (!formAreaId) errors.areaId = t("validation.areaRequired");
    if (!formTypeId) errors.typeId = t("validation.typeRequired");
    if (isCreate) {
      if (clientTab === "existing" && !clientId) errors.client = t("validation.clientRequired");
      if (clientTab === "new") {
        if (!newClientName.trim()) errors.newClientName = t("validation.clientRequired");
        if (newKind === ClientKind.COMPANY) {
          if (!newEik.trim()) errors.newEik = t("validation.eikRequired");
          else if (!validateEik(newEik.trim())) errors.newEik = t("validation.eikInvalid");
        } else if (newEik.trim() && !validateEik(newEik.trim())) {
          errors.newEik = t("validation.eikInvalid");
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (readOnly || noFieldAreas) return;
    if (!validateLocal()) return;
    if (clientTab === "new" && clientDupUi.saveBlocked) return;

    const floor = floorArea.trim() === "" ? null : Number(floorArea.replace(",", "."));
    const pointsN = Number.parseInt(points, 10);
    const base = {
      areaId: formAreaId,
      siteTypeId: formTypeId,
      name: name.trim().replace(/\s+/g, " "),
      address: address.trim().replace(/\s+/g, " "),
      latitude,
      longitude,
      contactPerson: contactPerson.trim() || null,
      contactPhone: contactPhone.trim() || null,
      floorAreaM2: floor != null && Number.isFinite(floor) ? floor : null,
      monitoringPointsCount: Number.isFinite(pointsN) ? pointsN : 0,
      notes: notes.trim() || null,
    };

    try {
      if (isCreate) {
        if (clientTab === "existing") {
          await createMutation.mutateAsync({
            data: { ...base, clientId: clientId! },
          });
        } else {
          await createMutation.mutateAsync({
            data: {
              ...base,
              newClient: {
                kind: newKind,
                name: newClientName.trim().replace(/\s+/g, " "),
                eik: newEik.trim() || null,
                phone: newPhone.trim() || null,
              },
            },
          });
        }
      } else if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: base });
      }
      await queryClient.invalidateQueries({ queryKey: getSitesControllerListQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getSitesControllerMapQueryKey() });
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleStatusToggle() {
    if (!editing || !canManage) return;
    const next =
      editing.status === SiteStatus.ACTIVE ? SiteStatus.TERMINATED : SiteStatus.ACTIVE;
    try {
      await updateMutation.mutateAsync({ id: editing.id, data: { status: next } });
      await queryClient.invalidateQueries({ queryKey: getSitesControllerListQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getSitesControllerMapQueryKey() });
      // Terminating auto-ends the current subscription server-side; drop the
      // 30s-stale list cache so the Абонамент tab does not keep showing open-ended.
      await queryClient.invalidateQueries({
        queryKey: getSubscriptionsControllerListQueryKey(),
      });
      setStatusConfirm(false);
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t("geo.unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? t("geo.denied") : t("geo.unavailable"));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const onClientSearch = useCallback((q: string) => setClientSearch(q), []);
  const saving = createMutation.isPending || updateMutation.isPending;
  const navUrl = buildNavigationUrl({ lat: latitude, lng: longitude, address });

  const fullEditing = editing && "client" in editing && "eik" in editing.client ? (editing as SiteItem) : null;

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        title={t("title")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                className={cn(
                  "text-ink-muted hover:text-ink",
                  view === "list" && "text-ink underline underline-offset-4",
                )}
                onClick={() => setView("list")}
              >
                {t("viewList")}
              </button>
              <button
                type="button"
                className={cn(
                  "text-ink-muted hover:text-ink",
                  view === "map" && "text-ink underline underline-offset-4",
                )}
                onClick={() => setView("map")}
              >
                {t("viewMap")}
              </button>
            </div>
            <PrimaryNewButton onClick={() => setDrawerTarget({ mode: "create" })}>
              {t("newSite")}
            </PrimaryNewButton>
          </div>
        }
      />

      <FilterBar className="flex-wrap">
        <ListSearchInput
          id="sites-search"
          aria-label={t("filters.search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t("filters.searchPlaceholder")}
        />
        <Select
          value={areaId || "__all"}
          onValueChange={(v) => {
            setAreaId(v === "__all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("filters.area")} className={cn(listFilterControlClass, "w-full sm:w-44")}>
            <SelectValue placeholder={t("filters.areaAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.areaAll")}</SelectItem>
            {fieldAreas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={siteTypeId || "__all"}
          onValueChange={(v) => {
            setSiteTypeId(v === "__all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("filters.type")} className={cn(listFilterControlClass, "w-full sm:w-44")}>
            <SelectValue placeholder={t("filters.typeAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.typeAll")}</SelectItem>
            {siteTypes.map((ty) => (
              <SelectItem key={ty.id} value={ty.id}>
                {ty.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("filters.status")} className={cn(listFilterControlClass, "w-full sm:w-40")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">{t("filters.statusActive")}</SelectItem>
            <SelectItem value="TERMINATED">{t("filters.statusTerminated")}</SelectItem>
            <SelectItem value="ALL">{t("filters.statusAll")}</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {view === "list" ? (
        isLoading ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : isError || items.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <>
            <ResponsiveList
              table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.site")}</TableHead>
                  <TableHead>{t("columns.address")}</TableHead>
                  <TableHead>{t("columns.area")}</TableHead>
                  <TableHead className="hidden min-[640px]:table-cell">{t("columns.type")}</TableHead>
                  <TableHead numeric className="hidden min-[640px]:table-cell">
                    {t("columns.points")}
                  </TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow
                    key={row.id}
                    interactive
                    tabIndex={0}
                    role="button"
                    onClick={() => setDrawerTarget({ mode: "edit", item: row })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDrawerTarget({ mode: "edit", item: row });
                      }
                    }}
                  >
                    <TableCell>
                      <div className="font-medium text-[#0F172A]">{row.name}</div>
                      <div className="text-sm text-ink-muted">{row.client.name}</div>
                    </TableCell>
                    <TableCell>{row.address}</TableCell>
                    <TableCell>{row.area.name}</TableCell>
                    <TableCell className="hidden min-[640px]:table-cell">
                      <SoftPill>{row.type.name}</SoftPill>
                    </TableCell>
                    <TableCell numeric className="num hidden min-[640px]:table-cell">
                      {row.monitoringPointsCount}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={row.status === SiteStatus.ACTIVE ? "ok" : "neutral"}>
                        {t(`status.${row.status}`)}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              }
              cards={
              <ul className="space-y-3">
                {items.map((row) => (
                  <li key={row.id}>
                    <MobileListCard onClick={() => setDrawerTarget({ mode: "edit", item: row })}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#0F172A]">{row.name}</p>
                          <p className="truncate text-xs text-ink-muted">{row.client.name}</p>
                        </div>
                        <StatusBadge variant={row.status === SiteStatus.ACTIVE ? "ok" : "neutral"}>
                          {t(`status.${row.status}`)}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 truncate text-sm text-[#64748B]">{row.address}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <SoftPill>{row.type.name}</SoftPill>
                        <span className="text-xs text-[#64748B]">{row.area.name}</span>
                        <span className="ml-auto text-xs tabular-nums text-[#94A3B8]">
                          {t("columns.points")}: {row.monitoringPointsCount}
                        </span>
                      </div>
                    </MobileListCard>
                  </li>
                ))}
              </ul>
              }
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )
      ) : (
        <div className="flex min-h-[480px] flex-1 flex-col gap-2">
          {mapTruncated ? <p className="text-sm text-ink-muted">{t("mapTruncated")}</p> : null}
          <SitesMap
            items={mapItems}
            onOpenSite={(id) => {
              void sitesControllerGetOne(id).then((res) =>
                setDrawerTarget({ mode: "edit", item: res.data as SiteItem }),
              );
            }}
            openLabel={t("open")}
            navigationLabel={t("navigation")}
            className="min-h-[480px] flex-1 rounded-[var(--radius-panel)] border border-border"
          />
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) setDrawerTarget(null);
        }}
        title={isCreate ? t("drawer.createTitle") : t("drawer.editTitle")}
        footer={
          readOnly || drawerTab !== "data" ? null : (
            <Button
              className="w-full"
              onClick={() => void handleSave()}
              disabled={saving || noFieldAreas || (clientTab === "new" && clientDupUi.saveBlocked)}
            >
              {tc("actions.save")}
            </Button>
          )
        }
      >
        <div className="space-y-6">
          {!isCreate ? (
            <Tabs
              value={drawerTab}
              onValueChange={(v) =>
                setDrawerTab(v as "data" | "visits" | "subscription")
              }
            >
              <TabsList>
                <TabsTrigger value="data">{t("tabs.data")}</TabsTrigger>
                <TabsTrigger value="visits">{t("tabs.visits")}</TabsTrigger>
                <TabsTrigger value="subscription">{t("tabs.subscription")}</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {drawerTab === "visits" && editing ? (
            <SitesVisitsPanel siteId={editing.id} />
          ) : null}

          {drawerTab === "subscription" && editing ? (
            <SitesSubscriptionPanel siteId={editing.id} canManage={canManage} />
          ) : null}

          {drawerTab === "data" ? (
          <>
          <section className="space-y-4">
            <h2 className="type-section">{t("drawer.sectionClient")}</h2>
            {isCreate ? (
              <>
                <div className="flex gap-4 text-sm">
                  <button
                    type="button"
                    className={cn(
                      "text-ink-muted",
                      clientTab === "existing" && "text-ink underline underline-offset-4",
                    )}
                    onClick={() => setClientTab("existing")}
                  >
                    {t("drawer.clientExisting")}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "text-ink-muted",
                      clientTab === "new" && "text-ink underline underline-offset-4",
                    )}
                    onClick={() => setClientTab("new")}
                  >
                    {t("drawer.clientNew")}
                  </button>
                </div>
                {clientTab === "existing" ? (
                  <FormField label={t("drawer.clientSearch")} error={fieldErrors.client}>
                    <SearchSelect
                      value={clientId}
                      displayLabel={clientLabel}
                      onChange={(id, opt) => {
                        setClientId(id);
                        setClientLabel(opt?.label ?? "");
                        if (opt && !name.trim()) setName(opt.label);
                      }}
                      onSearch={onClientSearch}
                      options={clientOptions}
                      loading={clientsLoading}
                      placeholder={t("drawer.clientSearchPlaceholder")}
                      emptyMessage={t("drawer.clientEmpty")}
                    />
                  </FormField>
                ) : (
                  <>
                    <FormField label={t("drawer.clientKind")}>
                      <Select
                        value={newKind}
                        onValueChange={(v) => setNewKind(v as typeof newKind)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ClientKind.COMPANY}>
                            {t("drawer.clientKindCompany")}
                          </SelectItem>
                          <SelectItem value={ClientKind.INDIVIDUAL}>
                            {t("drawer.clientKindIndividual")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField
                      label={
                        newKind === ClientKind.COMPANY
                          ? t("drawer.clientNameCompany")
                          : t("drawer.clientNameIndividual")
                      }
                      error={fieldErrors.newClientName}
                    >
                      <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                    </FormField>
                    {clientDupUi.similarNames.length > 0 ? (
                      <div className="space-y-1.5 bg-warn-bg px-3 py-2 text-sm text-warn-ink">
                        <p>{t("duplicates.similarTitle")}</p>
                        <ul>
                          {clientDupUi.similarNames.map((c) => (
                            <li key={c.id}>
                              {t("duplicates.similarItem", {
                                name: c.name,
                                eik: c.eik ?? t("emDash"),
                              })}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <FormField
                      label={t("drawer.clientEik")}
                      required={newKind === ClientKind.COMPANY}
                      error={
                        eikNoDetails
                          ? t("duplicates.eikNoDetails")
                          : fieldErrors.newEik ??
                            (clientDupUi.sameEik
                              ? t("duplicates.sameEik", { name: clientDupUi.sameEik.name })
                              : undefined)
                      }
                    >
                      <Input
                        value={newEik}
                        className="font-mono"
                        onChange={(e) => {
                          setNewEik(e.target.value);
                          setRaceDuplicateName(null);
                          setEikNoDetails(false);
                        }}
                      />
                    </FormField>
                    <FormField label={t("drawer.clientPhone")}>
                      <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                    </FormField>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm">
                {fullEditing?.client.name ?? clientLabel}
                {fullEditing && canManage ? (
                  <>
                    {t("drawer.clientOpenSep")}
                    <Link to="/clients" className="text-accent underline">
                      {t("open")}
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="type-section">{t("drawer.sectionBasics")}</h2>
            <FormField label={t("drawer.name")} required error={fieldErrors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
              />
            </FormField>
            <FormField label={t("drawer.type")} required error={fieldErrors.typeId}>
              <Select
                value={formTypeId || undefined}
                onValueChange={setFormTypeId}
                disabled={readOnly || siteTypes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("drawer.type")} />
                </SelectTrigger>
                <SelectContent>
                  {siteTypes.map((ty) => (
                    <SelectItem key={ty.id} value={ty.id}>
                      {ty.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("drawer.area")} required error={fieldErrors.areaId}>
              {noFieldAreas ? (
                <p className="text-sm text-ink-muted">{t("noAreas")}</p>
              ) : (
                <Select
                  value={formAreaId || undefined}
                  onValueChange={setFormAreaId}
                  disabled={readOnly || fieldAreas.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("drawer.area")} />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldAreas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </section>

          <section className="space-y-4">
            <h2 className="type-section">{t("drawer.sectionLocation")}</h2>
            <FormField label={t("drawer.address")} required error={fieldErrors.address}>
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                disabled={readOnly}
              />
            </FormField>
            {addressDupes.length > 0 ? (
              <div className="space-y-1.5 bg-warn-bg px-3 py-2 text-sm text-warn-ink">
                <p>{t("duplicates.addressTitle")}</p>
                <ul>
                  {addressDupes.map((d) => (
                    <li key={d.id}>
                      {t("duplicates.addressItem", { name: d.name, address: d.address })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!readOnly ? (
              <SiteLocationPicker
                latitude={latitude}
                longitude={longitude}
                onChange={(c) => {
                  if (!c) {
                    setLatitude(null);
                    setLongitude(null);
                    return;
                  }
                  setLatitude(c.latitude);
                  setLongitude(c.longitude);
                }}
              />
            ) : latitude != null && longitude != null ? (
              <SiteLocationPicker
                latitude={latitude}
                longitude={longitude}
                onChange={() => undefined}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-ink-muted">
                {latitude != null && longitude != null
                  ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                  : t("emDash")}
              </span>
              {!readOnly ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLatitude(null);
                      setLongitude(null);
                    }}
                  >
                    {t("drawer.clearCoords")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={useMyLocation}>
                    {t("drawer.useMyLocation")}
                  </Button>
                </>
              ) : null}
              {(latitude != null && longitude != null) || address.trim() ? (
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  {t("navigation")}
                </a>
              ) : null}
            </div>
            {geoError ? <p className="text-sm text-bad-ink">{geoError}</p> : null}
          </section>

          <section className="space-y-4">
            <h2 className="type-section">{t("drawer.sectionContact")}</h2>
            <FormField label={t("drawer.contactPerson")}>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                disabled={readOnly}
              />
            </FormField>
            <FormField label={t("drawer.contactPhone")}>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={readOnly}
              />
            </FormField>
            <FormField label={t("drawer.floorArea")}>
              <Input
                value={floorArea}
                onChange={(e) => setFloorArea(e.target.value)}
                className="num"
                disabled={readOnly}
              />
            </FormField>
            {canManage ? (
              <section className="space-y-2 rounded-none" data-testid="site-monitoring-section">
                <p className="text-sm text-ink-muted">
                  {t("drawer.pointsSection", { count: points || "0" })}
                </p>
                <FormField label={t("drawer.points")}>
                  <Input
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    className="num"
                    disabled={readOnly}
                    data-testid="site-monitoring-count"
                  />
                </FormField>
                <p className="text-xs text-ink-muted">{t("drawer.pointsHint")}</p>
              </section>
            ) : null}
            {editing ? (
              <SiteCertificatesSection
                siteId={editing.id}
                canManage={canManage}
                isField={isField}
              />
            ) : null}
            <FormField label={t("drawer.notes")}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={readOnly}
              />
            </FormField>
          </section>

          {canManage && editing ? (
            <section className="space-y-3 border-t border-border pt-4">
              <h2 className="type-section">{t("drawer.actionsSection")}</h2>
              <Button type="button" variant="secondary" onClick={() => setStatusConfirm(true)}>
                {editing.status === SiteStatus.ACTIVE
                  ? t("drawer.terminate")
                  : t("drawer.activate")}
              </Button>
            </section>
          ) : null}
          </>
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        open={statusConfirm}
        onOpenChange={setStatusConfirm}
        title={
          editing?.status === SiteStatus.ACTIVE
            ? t("confirm.terminateTitle")
            : t("confirm.activateTitle")
        }
        description={
          editing?.status === SiteStatus.ACTIVE
            ? t("confirm.terminateDescription", { name: editing?.name ?? "" })
            : t("confirm.activateDescription", { name: editing?.name ?? "" })
        }
        onConfirm={() => void handleStatusToggle()}
        loading={updateMutation.isPending}
      />
    </div>
  );
}

/** Muted certificates block on the site «Данни» tab (ADMIN/OFFICE counts; FIELD redacted list). */
function SiteCertificatesSection({
  siteId,
  canManage,
  isField,
}: {
  siteId: string;
  canManage: boolean;
  isField: boolean;
}) {
  const { t } = useTranslation("sites");
  const countsQuery = useCertifiedEmployeesControllerCounts(siteId, {
    query: { enabled: canManage },
  });
  const fieldQuery = useCertifiedEmployeesControllerCertifiedEmployees(
    siteId,
    undefined,
    { query: { enabled: isField } },
  );

  if (canManage) {
    const counts = countsQuery.data?.data;
    return (
      <section className="space-y-2" data-testid="site-certificates-section">
        <h2 className="type-section text-ink-muted">{t("drawer.certificatesSection")}</h2>
        <p className="text-sm text-ink-muted">
          {t("drawer.certificatesCounts", {
            current: counts?.current ?? "—",
            expiring: counts?.expiring ?? "—",
            expired: counts?.expired ?? "—",
          })}
        </p>
        <Link
          to="/certificates"
          search={{ siteId, employeeId: undefined, status: undefined, expiringWithin: undefined }}
          className="text-sm underline text-ink-muted"
          data-testid="site-certificates-link"
        >
          {t("drawer.certificatesLink")}
        </Link>
      </section>
    );
  }

  if (isField) {
    const items = fieldQuery.data?.data.items ?? [];
    return (
      <section className="space-y-2" data-testid="site-certificates-section">
        <h2 className="type-section text-ink-muted">{t("drawer.certificatesSection")}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("drawer.certificatesFieldEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li key={item.id} data-testid="site-certified-employee">
                {t("drawer.certificatesFieldRow", {
                  name: item.fullName,
                  renewal: item.nextRenewalAt
                    ? t("drawer.certificatesFieldRenewal", { date: item.nextRenewalAt })
                    : "",
                  title: t("drawer.certificatesFieldTitle", { title: item.jobTitle }),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return null;
}
