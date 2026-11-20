import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import styleguideBg from "@/i18n/locales/bg/styleguide.json";
import { toast } from "sonner";
import { getHealthControllerGetLivenessUrl, useHealthControllerGetLiveness } from "@/api/generated";
import { API_BASE_URL } from "@/api/mutator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge, STATUS_VARIANTS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatLv } from "@/lib/format";
import { SAMPLE_INVOICES, type SampleInvoice } from "./sample-data";

i18n.addResourceBundle("bg", "styleguide", styleguideBg, true, true);

type ColorToken = {
  cssVar: string;
  hex: string;
  labelKey:
    | "bg"
    | "surface"
    | "border"
    | "ink"
    | "inkMuted"
    | "accent"
    | "accentHover"
    | "accentTint"
    | "okBg"
    | "okInk"
    | "warnBg"
    | "warnInk"
    | "badBg"
    | "badInk"
    | "neutralBg"
    | "neutralInk";
};

const COLOR_TOKENS: ColorToken[] = [
  { cssVar: "--bg", hex: "#F6F7F8", labelKey: "bg" },
  { cssVar: "--surface", hex: "#FFFFFF", labelKey: "surface" },
  { cssVar: "--border", hex: "#E5E7EB", labelKey: "border" },
  { cssVar: "--ink", hex: "#111827", labelKey: "ink" },
  { cssVar: "--ink-muted", hex: "#6B7280", labelKey: "inkMuted" },
  { cssVar: "--accent", hex: "#1F6F54", labelKey: "accent" },
  { cssVar: "--accent-hover", hex: "#185A44", labelKey: "accentHover" },
  { cssVar: "--accent-tint", hex: "#E8F1ED", labelKey: "accentTint" },
  { cssVar: "--ok-bg", hex: "#E6EFE9", labelKey: "okBg" },
  { cssVar: "--ok-ink", hex: "#2F6B4F", labelKey: "okInk" },
  { cssVar: "--warn-bg", hex: "#F8EED7", labelKey: "warnBg" },
  { cssVar: "--warn-ink", hex: "#8A5A12", labelKey: "warnInk" },
  { cssVar: "--bad-bg", hex: "#F5E1E1", labelKey: "badBg" },
  { cssVar: "--bad-ink", hex: "#9B3B3B", labelKey: "badInk" },
  { cssVar: "--neutral-bg", hex: "#EEF0F3", labelKey: "neutralBg" },
  { cssVar: "--neutral-ink", hex: "#4B5563", labelKey: "neutralInk" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-8 first-of-type:border-t-0">
      <h2 className="type-section mb-4">{title}</h2>
      {children}
    </section>
  );
}

function TypeSelect({ id }: { id?: string }) {
  const { t } = useTranslation("styleguide");
  return (
    <Select defaultValue="restaurant">
      <SelectTrigger id={id}>
        <SelectValue placeholder={t("form.typePlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="restaurant">{t("form.typeRestaurant")}</SelectItem>
        <SelectItem value="hotel">{t("form.typeHotel")}</SelectItem>
        <SelectItem value="warehouse">{t("form.typeWarehouse")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ApiStatus() {
  const { t } = useTranslation("styleguide");
  const health = useHealthControllerGetLiveness({ query: { retry: false } });
  const healthUrl = `${API_BASE_URL || window.location.origin}${getHealthControllerGetLivenessUrl()}`;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="label">{t("api.label")}</span>
      {health.isPending ? (
        <StatusBadge variant="neutral">{t("api.checking")}</StatusBadge>
      ) : health.isSuccess ? (
        <StatusBadge variant="ok">{t("api.ok")}</StatusBadge>
      ) : (
        <StatusBadge variant="bad">{t("api.error")}</StatusBadge>
      )}
      <span className="label">{t("api.url")}</span>
      <code className="num text-sm">{healthUrl}</code>
      <Button variant="secondary" size="sm" onClick={() => void health.refetch()}>
        {t("api.retry")}
      </Button>
    </div>
  );
}

export default function Styleguide() {
  const { t } = useTranslation("styleguide");
  const { t: tc } = useTranslation();
  const [invoice, setInvoice] = useState<SampleInvoice | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [reminder, setReminder] = useState(true);

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      <Section title={t("sections.colors")}>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <li key={token.cssVar} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="size-10 shrink-0 rounded-control border border-border"
                style={{ backgroundColor: `var(${token.cssVar})` }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t(`colors.${token.labelKey}`)}</p>
                <p className="num text-xs text-ink-muted">{token.cssVar}</p>
                <p className="num text-xs text-ink-muted">{token.hex}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("sections.type")}>
        <dl className="grid gap-5">
          <div>
            <dt className="label mb-1">{t("type.pageTitleSpec")}</dt>
            <dd className="type-page-title">{t("type.pageTitle")}</dd>
          </div>
          <div>
            <dt className="label mb-1">{t("type.sectionHeaderSpec")}</dt>
            <dd className="type-section">{t("type.sectionHeader")}</dd>
          </div>
          <div>
            <dt className="label mb-1">{t("type.bodySpec")}</dt>
            <dd className="type-body max-w-xl">{t("type.body")}</dd>
          </div>
          <div>
            <dt className="label mb-1">{t("type.labelSpec")}</dt>
            <dd className="label">{t("type.label")}</dd>
          </div>
          <div>
            <dt className="label mb-1">{t("type.numSpec")}</dt>
            <dd className="num text-sm">{t("type.num")}</dd>
          </div>
        </dl>
      </Section>

      <Section title={t("sections.buttons")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t("buttons.primary")}</Button>
          <Button variant="secondary">{t("buttons.secondary")}</Button>
          <Button variant="ghost">{t("buttons.ghost")}</Button>
          <Button disabled>{t("buttons.disabled")}</Button>
        </div>
      </Section>

      <Section title={t("sections.forms")}>
        <form
          className="grid max-w-xl gap-4"
          onSubmit={(event) => event.preventDefault()}
          noValidate
        >
          <FormField label={t("form.name")} required>
            <Input defaultValue={t("form.nameValue")} />
          </FormField>
          <FormField label={t("form.eik")} error={t("form.eikError")} hint={t("form.eikHint")}>
            <Input defaultValue={t("form.eikValue")} inputMode="numeric" className="num" />
          </FormField>
          <FormField label={t("form.type")}>
            <TypeSelect />
          </FormField>
          <FormField label={t("form.notes")}>
            <Textarea defaultValue={t("form.notesValue")} />
          </FormField>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sg-reminder"
              checked={reminder}
              onCheckedChange={(value) => setReminder(value === true)}
            />
            <Label htmlFor="sg-reminder" className="font-normal">
              {t("form.reminder")}
            </Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit">{t("form.save")}</Button>
            <Button type="button" variant="secondary">
              {tc("actions.cancel")}
            </Button>
          </div>
        </form>
      </Section>

      <Section title={t("sections.status")}>
        <div className="flex flex-wrap items-center gap-3">
          {STATUS_VARIANTS.map((variant) => (
            <StatusBadge key={variant} variant={variant}>
              {t(`status.${variant}`)}
            </StatusBadge>
          ))}
        </div>
      </Section>

      <Section title={t("sections.filters")}>
        <FilterBar
          trailing={<Button variant="ghost">{t("filters.reset")}</Button>}
          aria-label={t("filters.search")}
        >
          <FormField label={t("filters.search")} className="w-full sm:w-64">
            <Input type="search" placeholder={t("filters.searchPlaceholder")} />
          </FormField>
          <FormField label={t("filters.status")} className="w-full sm:w-48">
            <TypeSelect />
          </FormField>
        </FilterBar>
      </Section>

      <Section title={t("sections.table")}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("table.number")}</TableHead>
              <TableHead>{t("table.client")}</TableHead>
              <TableHead>{t("table.date")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead numeric>{t("table.amount")}</TableHead>
              <TableHead numeric>{t("table.due")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_INVOICES.map((row) => (
              <TableRow key={row.id} interactive onClick={() => setInvoice(row)}>
                <TableCell className="num whitespace-nowrap">
                  <button
                    type="button"
                    className="num text-accent hover:underline"
                    aria-label={t("table.openAria", { number: row.number })}
                    onClick={(event) => {
                      event.stopPropagation();
                      setInvoice(row);
                    }}
                  >
                    {row.number}
                  </button>
                </TableCell>
                <TableCell>{row.client}</TableCell>
                <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                <TableCell>
                  <StatusBadge variant={row.status}>{t(`status.${row.status}`)}</StatusBadge>
                </TableCell>
                <TableCell numeric>{formatLv(row.amount)}</TableCell>
                <TableCell numeric>{formatLv(row.due)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageSize={6} total={42} onPageChange={setPage} />
      </Section>

      <Section title={t("sections.tabs")}>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="visits">{t("tabs.visits")}</TabsTrigger>
            <TabsTrigger value="documents">{t("tabs.documents")}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">{t("tabs.overviewBody")}</TabsContent>
          <TabsContent value="visits">{t("tabs.visitsBody")}</TabsContent>
          <TabsContent value="documents">{t("tabs.documentsBody")}</TabsContent>
        </Tabs>
      </Section>

      <Section title={t("sections.empty")}>
        <EmptyState
          message={t("empty.message")}
          action={{ label: t("empty.action"), onClick: () => undefined }}
        />
      </Section>

      <Section title={t("sections.feedback")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            {t("feedback.openDrawer")}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            {t("feedback.openConfirm")}
          </Button>
          <Button variant="secondary" onClick={() => toast.success(t("feedback.toastOkMessage"))}>
            {t("feedback.toastOk")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.error(t("feedback.toastErrorMessage"))}
          >
            {t("feedback.toastError")}
          </Button>
        </div>
      </Section>

      <Section title={t("sections.api")}>
        <ApiStatus />
      </Section>

      {/* Drawer opened from a table row */}
      <Drawer
        open={invoice !== null}
        onOpenChange={(open) => {
          if (!open) setInvoice(null);
        }}
        title={t("drawer.title", { number: invoice?.number ?? "" })}
        description={t("drawer.description", { client: invoice?.client ?? "" })}
        footer={
          <Button variant="secondary" onClick={() => setInvoice(null)}>
            {tc("actions.close")}
          </Button>
        }
      >
        {invoice ? (
          <dl className="grid gap-4">
            <div>
              <dt className="label">{t("drawer.client")}</dt>
              <dd>{invoice.client}</dd>
            </div>
            <div>
              <dt className="label">{t("drawer.date")}</dt>
              <dd>{invoice.date}</dd>
            </div>
            <div>
              <dt className="label">{t("table.status")}</dt>
              <dd>
                <StatusBadge variant={invoice.status}>{t(`status.${invoice.status}`)}</StatusBadge>
              </dd>
            </div>
            <div>
              <dt className="label">{t("drawer.amount")}</dt>
              <dd className="num">{formatLv(invoice.amount)}</dd>
            </div>
            <div>
              <dt className="label">{t("drawer.due")}</dt>
              <dd className="num">{formatLv(invoice.due)}</dd>
            </div>
            <p className="text-sm text-ink-muted">{t("drawer.note")}</p>
          </dl>
        ) : null}
      </Drawer>

      {/* Standalone drawer (from the feedback section) */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={t("form.name")}
        description={t("form.nameValue")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>{tc("actions.save")}</Button>
          </>
        }
      >
        <p className="text-sm">{t("tabs.overviewBody")}</p>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("feedback.confirmTitle")}
        description={t("feedback.confirmDescription")}
        confirmLabel={t("feedback.confirmAction")}
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success(t("feedback.toastOkMessage"));
        }}
      />
    </>
  );
}
