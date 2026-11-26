import {
  EmptyInvoiceError,
  computeLineTotal,
  sumLines,
} from "@ddcrm/shared";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useClientsControllerList } from "@/api/generated/clients/clients";
import type { InvoiceItemDtoOutput } from "@/api/generated/model";
import { sitesControllerList } from "@/api/generated/sites/sites";
import { visitsControllerList } from "@/api/generated/visits/visits";
import { CheckboxGroup } from "@/components/checkbox-group";
import { FormField } from "@/components/form-field";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
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
import { formatIsoDate, formatMoney } from "@/lib/format";

const VAT_OPTIONS = ["20.00", "9.00", "0.00"] as const;
const DEFAULT_VAT = "20.00";

export type InvoiceLineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
};

export type InvoiceFormValues = {
  clientId: string;
  clientLabel: string;
  visitIds: string[];
  lines: InvoiceLineDraft[];
  notes: string;
};

export type InvoiceFormProps = {
  mode: "create" | "edit";
  initial?: InvoiceItemDtoOutput | null;
  saving?: boolean;
  primaryLabel: string;
  onSubmit: (values: InvoiceFormValues) => void | Promise<void>;
  /** Extra actions (e.g. Issue) rendered next to primary save. */
  secondaryAction?: ReactNode;
};

function newLineKey(): string {
  return crypto.randomUUID();
}

function blankLine(): InvoiceLineDraft {
  return {
    key: newLineKey(),
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    vatRate: DEFAULT_VAT,
  };
}

function linesFromInvoice(invoice: InvoiceItemDtoOutput): InvoiceLineDraft[] {
  return invoice.lines.map((line) => ({
    key: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
  }));
}

function moneyOrZero(lines: InvoiceLineDraft[]) {
  try {
    return sumLines(
      lines.map((line) => ({
        amount: computeLineTotal(line.quantity || "0", line.unitPrice || "0"),
        vatRate: line.vatRate || "0",
      })),
    );
  } catch (err) {
    if (err instanceof EmptyInvoiceError) {
      return { net: "0.00", vat: "0.00", gross: "0.00" };
    }
    return { net: "0.00", vat: "0.00", gross: "0.00" };
  }
}

type VisitOption = {
  id: string;
  siteName: string;
  visitDate: string;
  treatmentType: string;
  chargedAmount: number;
};

export function InvoiceForm({
  mode: _mode,
  initial,
  saving,
  primaryLabel,
  onSubmit,
  secondaryAction,
}: InvoiceFormProps) {
  void _mode;
  const { t } = useTranslation("invoices");
  const { t: tv } = useTranslation("visits");
  const { t: tc } = useTranslation("common");

  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientLabel, setClientLabel] = useState(() => {
    if (!initial) return "";
    return initial.client?.name ?? initial.snapshot?.legalName ?? "";
  });
  const [clientSearch, setClientSearch] = useState("");
  const [visitIds, setVisitIds] = useState<string[]>(() => initial?.visits.map((v) => v.id) ?? []);
  const [, setVisitLineKeys] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() =>
    initial ? linesFromInvoice(initial) : [],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [clientError, setClientError] = useState<string | undefined>();

  const clientsQuery = useClientsControllerList({
    page: 1,
    pageSize: 10,
    search: clientSearch.trim() || undefined,
    isActive: true,
  });
  const clientOptions: SearchSelectOption[] = (clientsQuery.data?.data.items ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.eik,
  }));

  const sitesQuery = useQuery({
    queryKey: ["invoice-form-sites", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const res = await sitesControllerList({
        clientId,
        page: 1,
        pageSize: 50,
        status: "ACTIVE",
      });
      return res.data.items;
    },
  });

  const siteIds = (sitesQuery.data ?? []).map((s) => s.id);
  const visitQueries = useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: ["invoice-form-visits", siteId],
      enabled: Boolean(clientId) && siteIds.length > 0,
      queryFn: async (): Promise<VisitOption[]> => {
        const res = await visitsControllerList({
          siteId,
          status: "ACTIVE",
          page: 1,
          pageSize: 50,
        });
        return res.data.items.map((v) => ({
          id: v.id,
          siteName: v.site.name,
          visitDate: v.visitDate,
          treatmentType: v.treatmentType,
          chargedAmount: v.chargedAmount,
        }));
      },
    })),
  });

  const visitOptions = useMemo(() => {
    const all: VisitOption[] = [];
    for (const q of visitQueries) {
      if (q.data) all.push(...q.data);
    }
    // Keep currently linked visits visible even if filtered out of ACTIVE lists.
    if (initial?.visits) {
      for (const linked of initial.visits) {
        if (!all.some((v) => v.id === linked.id)) {
          all.push({
            id: linked.id,
            siteName: linked.siteName,
            visitDate: linked.visitDate,
            treatmentType: linked.treatmentType,
            chargedAmount: Number(linked.chargedAmount),
          });
        }
      }
    }
    all.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    return all;
  }, [visitQueries, initial?.visits]);

  const visitsLoading =
    sitesQuery.isLoading || visitQueries.some((q) => q.isLoading || q.isFetching);

  const totals = useMemo(() => moneyOrZero(lines), [lines]);

  const onSearchClients = useCallback((query: string) => {
    setClientSearch(query);
  }, []);

  function updateLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
    setVisitLineKeys((prev) => {
      const next = { ...prev };
      for (const [visitId, lineKey] of Object.entries(next)) {
        if (lineKey === key) delete next[visitId];
      }
      return next;
    });
  }

  function handleVisitChange(nextIds: string[]) {
    const added = nextIds.filter((id) => !visitIds.includes(id));
    const removed = visitIds.filter((id) => !nextIds.includes(id));

    setVisitIds(nextIds);

    if (removed.length > 0) {
      setVisitLineKeys((prev) => {
        const next = { ...prev };
        const keysToDrop = new Set<string>();
        for (const visitId of removed) {
          const key = next[visitId];
          if (key) {
            keysToDrop.add(key);
            delete next[visitId];
          }
        }
        if (keysToDrop.size > 0) {
          setLines((linesPrev) => linesPrev.filter((line) => !keysToDrop.has(line.key)));
        }
        return next;
      });
    }

    if (added.length > 0) {
      const newKeys: Record<string, string> = {};
      const newLines: InvoiceLineDraft[] = [];
      for (const visitId of added) {
        const visit = visitOptions.find((v) => v.id === visitId);
        if (!visit) continue;
        const key = newLineKey();
        newKeys[visitId] = key;
        const treatmentLabel = tv(`treatmentTypes.${visit.treatmentType}`, {
          defaultValue: visit.treatmentType,
        });
        newLines.push({
          key,
          description: `${visit.siteName} — ${treatmentLabel}`,
          quantity: "1",
          unitPrice: Number(visit.chargedAmount).toFixed(2),
          vatRate: DEFAULT_VAT,
        });
      }
      if (newLines.length > 0) {
        setVisitLineKeys((prev) => ({ ...prev, ...newKeys }));
        setLines((prev) => [...prev, ...newLines]);
      }
    }
  }

  function handleClientChange(id: string | null, option: SearchSelectOption | null) {
    const nextId = id ?? "";
    setClientId(nextId);
    setClientLabel(option?.label ?? "");
    setClientError(undefined);
    if (nextId !== clientId) {
      setVisitIds([]);
      setVisitLineKeys({});
      setLines([]);
    }
  }

  async function handleSubmit() {
    if (!clientId) {
      setClientError(t("validation.clientRequired"));
      return;
    }
    await onSubmit({
      clientId,
      clientLabel,
      visitIds,
      lines,
      notes,
    });
  }

  return (
    <div className="space-y-6" data-testid="invoice-form">
      <div className="flex flex-col gap-1.5">
        <Label>
          {t("fields.client")} <span className="label">{tc("form.required")}</span>
        </Label>
        <SearchSelect
          value={clientId || null}
          displayLabel={clientLabel}
          onChange={handleClientChange}
          onSearch={onSearchClients}
          options={clientOptions}
          placeholder={t("fields.clientPlaceholder")}
          loading={clientsQuery.isFetching}
          emptyMessage={t("empty")}
        />
        {clientError ? <p className="text-sm text-bad-ink">{clientError}</p> : null}
      </div>

      {clientId ? (
        <div className="space-y-2" data-testid="invoice-visits">
          <p className="text-sm font-medium">{t("addVisits")}</p>
          {visitsLoading ? (
            <p className="text-sm text-ink-muted">{t("visitsLoading")}</p>
          ) : visitOptions.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noVisits")}</p>
          ) : (
            <CheckboxGroup
              name="invoice-visits"
              value={visitIds}
              onChange={handleVisitChange}
              options={visitOptions.map((v) => ({
                value: v.id,
                label: (
                  <span>
                    {formatIsoDate(v.visitDate)}
                    {t("metaSep")}
                    {v.siteName}
                    {t("metaSep")}
                    {tv(`treatmentTypes.${v.treatmentType}`, {
                      defaultValue: v.treatmentType,
                    })}
                    {t("metaSep")}
                    <span className="num">{formatMoney(v.chargedAmount)}</span>
                  </span>
                ),
              }))}
            />
          )}
        </div>
      ) : null}

      <div className="space-y-3" data-testid="invoice-lines">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("issued.lines")}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setLines((prev) => [...prev, blankLine()])}
          >
            {t("addLine")}
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("validation.linesRequired")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.description")}</TableHead>
                <TableHead numeric>{t("fields.quantity")}</TableHead>
                <TableHead numeric>{t("fields.unitPrice")}</TableHead>
                <TableHead>{t("fields.vatRate")}</TableHead>
                <TableHead numeric>{t("fields.lineTotal")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                let lineTotal = "0.00";
                try {
                  lineTotal = computeLineTotal(line.quantity || "0", line.unitPrice || "0");
                } catch {
                  lineTotal = "0.00";
                }
                return (
                  <TableRow key={line.key}>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        data-testid="invoice-line-description"
                      />
                    </TableCell>
                    <TableCell numeric>
                      <Input
                        className="w-24"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        data-testid="invoice-line-quantity"
                      />
                    </TableCell>
                    <TableCell numeric>
                      <Input
                        className="w-28"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                        data-testid="invoice-line-unit-price"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.vatRate}
                        onValueChange={(v) => updateLine(line.key, { vatRate: v })}
                      >
                        <SelectTrigger className="w-24" data-testid="invoice-line-vat">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_OPTIONS.map((rate) => (
                            <SelectItem key={rate} value={rate}>
                              {t(`vatRates.${rate.split(".")[0]}` as "vatRates.20")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell numeric className="num">
                      {formatMoney(Number(lineTotal))}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => removeLine(line.key)}
                        data-testid="invoice-line-remove"
                      >
                        {t("removeLine")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-col items-end gap-1 text-sm" data-testid="invoice-totals">
          <div>
            {t("fields.net")}
            {t("labelSep")}
            <span className="num">{formatMoney(Number(totals.net))}</span>
          </div>
          <div>
            {t("fields.vat")}
            {t("labelSep")}
            <span className="num">{formatMoney(Number(totals.vat))}</span>
          </div>
          <div className="font-medium">
            {t("fields.gross")}
            {t("labelSep")}
            <span className="num">{formatMoney(Number(totals.gross))}</span>
          </div>
        </div>
      </div>

      <FormField label={t("fields.notes")}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          data-testid="invoice-notes"
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          data-testid="invoice-save"
        >
          {primaryLabel}
        </Button>
        {secondaryAction}
      </div>
    </div>
  );
}
