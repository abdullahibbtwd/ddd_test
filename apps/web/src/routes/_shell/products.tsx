import {
  MeasurementUnit,
  ProductFormulation,
  type ProductItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getProductsControllerListQueryKey,
  useProductsControllerCreate,
  useProductsControllerList,
  useProductsControllerUpdate,
} from "@/api/generated/products/products";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import {
  ListSearchInput,
  ListToolbar,
  listFilterControlClass,
  MobileListCard,
  PrimaryNewButton,
  ResponsiveList,
  SoftPill,
} from "@/components/list-chrome";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
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
import { translateApiError } from "@/lib/error-message";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/products")({
  component: ProductsPage,
});

const PAGE_SIZE = 20;
const FORMULATIONS = Object.values(ProductFormulation);
const UNITS = Object.values(MeasurementUnit);

type DrawerTarget = { mode: "create" } | { mode: "edit"; item: ProductItem };

function ProductsPage() {
  const { t } = useTranslation("products");
  const { t: te } = useTranslation("errors");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [archivedFilter, setArchivedFilter] = useState<"false" | "true" | "all">("false");
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  const [name, setName] = useState("");
  const [substances, setSubstances] = useState("");
  const [formulation, setFormulation] = useState<string>(ProductFormulation.LIQUID);
  const [permitNumber, setPermitNumber] = useState("");
  const [permitHolder, setPermitHolder] = useState("");
  const [antidote, setAntidote] = useState("");
  const [ventilationPeriod, setVentilationPeriod] = useState("");
  const [exposurePeriod, setExposurePeriod] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [defaultDosage, setDefaultDosage] = useState("");
  const [defaultUnit, setDefaultUnit] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: search.trim() || undefined,
      archived: archivedFilter,
    }),
    [page, search, archivedFilter],
  );

  const listQuery = useProductsControllerList(listParams);
  const createMutation = useProductsControllerCreate();
  const updateMutation = useProductsControllerUpdate();

  const items = (listQuery.data?.data.items ?? []) as ProductItem[];
  const total = listQuery.data?.data.total ?? 0;

  function openCreate() {
    setName("");
    setSubstances("");
    setFormulation(ProductFormulation.LIQUID);
    setPermitNumber("");
    setPermitHolder("");
    setAntidote("");
    setVentilationPeriod("");
    setExposurePeriod("");
    setRecommendations("");
    setDefaultDosage("");
    setDefaultUnit("");
    setNameError(null);
    setDrawer({ mode: "create" });
  }

  function openEdit(item: ProductItem) {
    setName(item.name);
    setSubstances(item.activeSubstances.join("\n"));
    setFormulation(item.formulation);
    setPermitNumber(item.permitNumber ?? "");
    setPermitHolder(item.permitHolder ?? "");
    setAntidote(item.antidote ?? "");
    setVentilationPeriod(item.ventilationPeriod ?? "");
    setExposurePeriod(item.exposurePeriod ?? "");
    setRecommendations(item.recommendations ?? "");
    setDefaultDosage(item.defaultDosage ?? "");
    setDefaultUnit(item.defaultUnit ?? "");
    setNameError(null);
    setDrawer({ mode: "edit", item });
  }

  function parseSubstances(): string[] {
    return substances
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleSave() {
    if (name.trim().length < 2) {
      setNameError(t("validation.nameRequired"));
      return;
    }
    setNameError(null);
    const payload = {
      name: name.trim(),
      activeSubstances: parseSubstances(),
      formulation: formulation as (typeof FORMULATIONS)[number],
      permitNumber: permitNumber.trim() || null,
      permitHolder: permitHolder.trim() || null,
      antidote: antidote.trim() || null,
      ventilationPeriod: ventilationPeriod.trim() || null,
      exposurePeriod: exposurePeriod.trim() || null,
      recommendations: recommendations.trim() || null,
      defaultDosage: defaultDosage.trim() || null,
      defaultUnit: (defaultUnit || null) as (typeof UNITS)[number] | null,
    };
    try {
      if (drawer?.mode === "create") {
        await createMutation.mutateAsync({ data: payload });
      } else if (drawer?.mode === "edit") {
        await updateMutation.mutateAsync({ id: drawer.item.id, data: payload });
      }
      setDrawer(null);
      await queryClient.invalidateQueries({ queryKey: getProductsControllerListQueryKey() });
      toast.success(t("save"));
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  async function handleArchive(item: ProductItem, archived: boolean) {
    try {
      await updateMutation.mutateAsync({ id: item.id, data: { archived } });
      await queryClient.invalidateQueries({ queryKey: getProductsControllerListQueryKey() });
      if (drawer?.mode === "edit" && drawer.item.id === item.id) {
        setDrawer({ mode: "edit", item: { ...item, archived } });
      }
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  return (
    <div className="space-y-4" data-testid="products-page">
      <PageHeader
        title={t("title")}
        actions={
          <PrimaryNewButton data-testid="products-new" onClick={openCreate}>
            {t("new")}
          </PrimaryNewButton>
        }
      />

      <ListToolbar>
        <ListSearchInput
          data-testid="products-search"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Select
          value={archivedFilter}
          onValueChange={(v) => {
            setPage(1);
            setArchivedFilter(v as "false" | "true" | "all");
          }}
        >
          <SelectTrigger
            className={cn(listFilterControlClass, "w-full sm:w-40")}
            data-testid="products-archived-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">{t("active")}</SelectItem>
            <SelectItem value="true">{t("archived")}</SelectItem>
            <SelectItem value="all">{t("all")}</SelectItem>
          </SelectContent>
        </Select>
      </ListToolbar>

      {items.length === 0 && !listQuery.isLoading ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ResponsiveList
          table={
            <Table data-testid="products-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead>{t("columns.substances")}</TableHead>
                  <TableHead>{t("columns.formulation")}</TableHead>
                  <TableHead>{t("columns.permit")}</TableHead>
                  <TableHead>{t("columns.archived")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    interactive
                    data-testid={`product-row-${item.id}`}
                    onClick={() => openEdit(item)}
                  >
                    <TableCell className="font-medium text-[#0F172A]">{item.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-ink-muted">
                      {item.activeSubstances.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <SoftPill>{t(`formulations.${item.formulation}` as const)}</SoftPill>
                    </TableCell>
                    <TableCell>{item.permitNumber ?? "—"}</TableCell>
                    <TableCell>{item.archived ? t("archived") : "—"}</TableCell>
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
                    data-testid={`product-card-${item.id}`}
                    onClick={() => openEdit(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold text-[#0F172A]">{item.name}</p>
                      <SoftPill>{t(`formulations.${item.formulation}` as const)}</SoftPill>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-[#64748B]">
                      {item.activeSubstances.join(", ") || "—"}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-[#64748B]">
                      <span>{item.permitNumber ?? "—"}</span>
                      {item.archived ? <span>{t("archived")}</span> : null}
                    </div>
                  </MobileListCard>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <Drawer
        open={drawer !== null}
        onOpenChange={(open) => {
          if (!open) setDrawer(null);
        }}
        title={drawer?.mode === "create" ? t("new") : t("title")}
      >
        <div className="space-y-4 p-4" data-testid="product-drawer">
          <FormField label={t("fields.name")} error={nameError}>
            <Input
              data-testid="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label={t("fields.activeSubstances")} hint={t("fields.activeSubstancesHint")}>
            <Textarea
              data-testid="product-substances"
              value={substances}
              onChange={(e) => setSubstances(e.target.value)}
              rows={3}
            />
          </FormField>
          <FormField label={t("fields.formulation")}>
            <Select value={formulation} onValueChange={setFormulation}>
              <SelectTrigger data-testid="product-formulation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMULATIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`formulations.${f}` as const)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("fields.permitNumber")}>
            <Input value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} />
          </FormField>
          <FormField label={t("fields.permitHolder")}>
            <Input value={permitHolder} onChange={(e) => setPermitHolder(e.target.value)} />
          </FormField>
          <FormField label={t("fields.antidote")}>
            <Input value={antidote} onChange={(e) => setAntidote(e.target.value)} />
          </FormField>
          <FormField label={t("fields.ventilationPeriod")}>
            <Input
              value={ventilationPeriod}
              onChange={(e) => setVentilationPeriod(e.target.value)}
            />
          </FormField>
          <FormField label={t("fields.exposurePeriod")}>
            <Input value={exposurePeriod} onChange={(e) => setExposurePeriod(e.target.value)} />
          </FormField>
          <FormField label={t("fields.recommendations")}>
            <Textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              rows={3}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("fields.defaultDosage")}>
              <Input
                value={defaultDosage}
                onChange={(e) => setDefaultDosage(e.target.value)}
                inputMode="decimal"
              />
            </FormField>
            <FormField label={t("fields.defaultUnit")}>
              <Select
                value={defaultUnit || "__none__"}
                onValueChange={(v) => setDefaultUnit(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("emDash", { defaultValue: "—" })}</SelectItem>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`units.${u}` as const)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <Button
            className="w-full"
            data-testid="product-save"
            disabled={createMutation.isPending || updateMutation.isPending}
            onClick={() => void handleSave()}
          >
            {t("save")}
          </Button>

          {drawer?.mode === "edit" ? (
            <Button
              variant="secondary"
              className="w-full text-ink-muted"
              data-testid="product-archive"
              onClick={() =>
                void handleArchive(drawer.item, !drawer.item.archived)
              }
            >
              {drawer.item.archived ? t("unarchive") : t("archive")}
            </Button>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
