import {
  MeasurementUnit,
  MonitoringPointStatus,
  type MeasurementUnit as MeasurementUnitT,
  type MonitoringPointStatus as MonitoringPointStatusT,
} from "@ddcrm/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMonitoringControllerBatchChecks, useMonitoringControllerListChecks, useMonitoringControllerListPoints } from "@/api/generated/monitoring/monitoring";
import { useProductsControllerList } from "@/api/generated/products/products";
import {
  useVisitProductsControllerCreate,
  useVisitProductsControllerList,
  useVisitProductsControllerRemove,
} from "@/api/generated/visit-products/visit-products";
import { isApiRequestError } from "@/api/mutator";
import { useAbility } from "@/auth/ability";
import { Drawer } from "@/components/drawer";
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
import { translateApiError } from "@/lib/error-message";

const UNITS = Object.values(MeasurementUnit);
const STATUSES = Object.values(MonitoringPointStatus);

export type VisitProductsPanelProps = {
  visitId: string;
  siteId: string;
};

export function VisitProductsPanel({ visitId, siteId }: VisitProductsPanelProps) {
  const { t } = useTranslation("products");
  const { t: te } = useTranslation("errors");
  const ability = useAbility();

  const productsQuery = useVisitProductsControllerList(visitId);
  const checksQuery = useMonitoringControllerListChecks(visitId);
  const pointsQuery = useMonitoringControllerListPoints(siteId, {
    page: 1,
    pageSize: 100,
    active: "true",
  });

  const createProduct = useVisitProductsControllerCreate();
  const removeProduct = useVisitProductsControllerRemove();
  const batchChecks = useMonitoringControllerBatchChecks();

  const frozen = productsQuery.data?.data.frozen ?? checksQuery.data?.data.frozen ?? false;
  const canWrite = ability.can("manage", "VisitProduct") && !frozen;

  const [productDrawer, setProductDrawer] = useState(false);
  const [checksDrawer, setChecksDrawer] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<MeasurementUnitT>(MeasurementUnit.ML);
  const [notes, setNotes] = useState("");
  const [checkStatus, setCheckStatus] = useState<Record<string, MonitoringPointStatusT>>({});

  const productPicker = useProductsControllerList(
    { page: 1, pageSize: 100, archived: "false" },
    { query: { enabled: productDrawer } },
  );

  const pickerItems = useMemo(
    () => productPicker.data?.data.items ?? [],
    [productPicker.data],
  );

  const visitProducts = productsQuery.data?.data.items ?? [];
  const checks = checksQuery.data?.data.items ?? [];
  const activePoints = pointsQuery.data?.data.items ?? [];
  const checkByPoint = useMemo(() => {
    const map = new Map(checks.map((c) => [c.pointId, c]));
    return map;
  }, [checks]);

  async function handleAddProduct() {
    if (!productId || !(Number(quantity) > 0)) return;
    try {
      await createProduct.mutateAsync({
        id: visitId,
        data: { productId, quantity, unit, notes: notes || null },
      });
      setProductDrawer(false);
      setProductId("");
      setQuantity("1");
      setNotes("");
      void productsQuery.refetch();
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeProduct.mutateAsync({ id });
      void productsQuery.refetch();
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  function openChecksDrawer() {
    const initial: Record<string, MonitoringPointStatusT> = {};
    for (const point of activePoints) {
      const existing = checkByPoint.get(point.id);
      initial[point.id] = (existing?.status as MonitoringPointStatusT) ?? MonitoringPointStatus.OK;
    }
    setCheckStatus(initial);
    setChecksDrawer(true);
  }

  async function handleSaveChecks() {
    try {
      await batchChecks.mutateAsync({
        id: visitId,
        data: {
          checks: Object.entries(checkStatus).map(([pointId, status]) => ({
            pointId,
            status,
            notes: null,
          })),
        },
      });
      setChecksDrawer(false);
      void checksQuery.refetch();
    } catch (error) {
      toast.error(
        isApiRequestError(error) ? translateApiError(te, error.code) : te("unknown"),
      );
    }
  }

  function openReport() {
    window.open(`/api/visits/${visitId}/service-report?copy=0`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6 border-t border-border pt-6" data-testid="visit-products-panel">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink-muted">{t("visit.section")}</h2>
          {canWrite ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="visit-add-product"
              onClick={() => setProductDrawer(true)}
            >
              {t("visit.add")}
            </Button>
          ) : null}
        </div>
        {frozen ? (
          <p className="text-xs text-ink-muted" data-testid="visit-products-frozen">
            {t("visit.frozen")}
          </p>
        ) : null}
        {visitProducts.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("visit.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {visitProducts.map((vp) => {
              const line = `${vp.productName} · ${vp.quantity} ${t(`units.${vp.unit}` as const)}`;
              return (
              <li
                key={vp.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
                data-testid={`visit-product-${vp.id}`}
              >
                <span>{line}</span>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleRemove(vp.id)}
                  >
                    {t("visit.remove")}
                  </Button>
                ) : null}
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink-muted">{t("points.section")}</h2>
          {canWrite && activePoints.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="visit-mark-checks"
              onClick={openChecksDrawer}
            >
              {t("points.mark")}
            </Button>
          ) : null}
        </div>
        {frozen ? (
          <p className="text-xs text-ink-muted" data-testid="visit-checks-frozen">
            {t("points.frozen")}
          </p>
        ) : null}
        {activePoints.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("points.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {activePoints.map((point) => {
              const check = checkByPoint.get(point.id);
              const label = `${point.label} (${point.type})`;
              return (
                <li key={point.id} className="flex justify-between py-2 text-sm">
                  <span>{label}</span>
                  <span className="text-ink-muted">
                    {check
                      ? t(`points.status.${check.status}` as const)
                      : t("points.unchecked")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Button
        type="button"
        className="w-full"
        data-testid="visit-download-report"
        onClick={openReport}
      >
        {t("report.download")}
      </Button>

      <Drawer
        open={productDrawer}
        onOpenChange={setProductDrawer}
        title={t("visit.add")}
      >
        <div className="space-y-4 p-4" data-testid="visit-product-drawer">
          <div className="space-y-1">
            <Label>{t("visit.picker")}</Label>
            <Select
              value={productId || undefined}
              onValueChange={(id) => {
                setProductId(id);
                const selected = pickerItems.find((p) => p.id === id);
                if (selected?.defaultUnit) {
                  setUnit(selected.defaultUnit as MeasurementUnitT);
                }
              }}
            >
              <SelectTrigger data-testid="visit-product-picker">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pickerItems.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("visit.quantity")}</Label>
            <Input
              data-testid="visit-product-quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("visit.unit")}</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as MeasurementUnitT)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {t(`units.${u}` as const)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("visit.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button
            className="w-full"
            data-testid="visit-product-save"
            disabled={!productId || createProduct.isPending}
            onClick={() => void handleAddProduct()}
          >
            {t("save")}
          </Button>
        </div>
      </Drawer>

      <Drawer open={checksDrawer} onOpenChange={setChecksDrawer} title={t("points.mark")}>
        <div className="space-y-3 p-4" data-testid="visit-checks-drawer">
          {activePoints.map((point) => {
            const label = `${point.label} (${point.type})`;
            return (
            <div key={point.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{label}</span>
              <Select
                value={checkStatus[point.id] ?? MonitoringPointStatus.OK}
                onValueChange={(v) =>
                  setCheckStatus((prev) => ({
                    ...prev,
                    [point.id]: v as MonitoringPointStatusT,
                  }))
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`points.status.${s}` as const)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            );
          })}
          <Button
            className="w-full"
            data-testid="visit-checks-save"
            disabled={batchChecks.isPending}
            onClick={() => void handleSaveChecks()}
          >
            {t("save")}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
