import {
  FoodResultStatus,
  ServiceType,
  type FoodRecordItem,
  type FoodScheduleItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getFoodRecordsControllerListQueryKey,
  useFoodRecordsControllerCreate,
  useFoodRecordsControllerList,
} from "@/api/generated/food-records/food-records";
import {
  getFoodSchedulesControllerListQueryKey,
  useFoodSchedulesControllerCreate,
  useFoodSchedulesControllerList,
  useFoodSchedulesControllerUpdate,
} from "@/api/generated/food-schedules/food-schedules";
import { useSitesControllerList } from "@/api/generated/sites/sites";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { MobileListCard, PrimaryNewButton, ResponsiveList } from "@/components/list-chrome";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate } from "@/lib/format";
import { translateApiError } from "@/lib/error-message";

export const Route = createFileRoute("/_shell/food")({
  component: FoodPage,
});

const PAGE_SIZE = 20;
const SERVICES = Object.values(ServiceType);

function resultVariant(status: string) {
  if (status === FoodResultStatus.CONFORMING) return "ok" as const;
  if (status === FoodResultStatus.NON_CONFORMING) return "bad" as const;
  return "warn" as const;
}

function FoodPage() {
  const { t } = useTranslation("food");
  const { t: te } = useTranslation("errors");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("schedules");
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<FoodRecordItem | null>(null);
  const [createScheduleOpen, setCreateScheduleOpen] = useState(false);
  const [createRecordOpen, setCreateRecordOpen] = useState(false);

  const [siteId, setSiteId] = useState("");
  const [serviceType, setServiceType] = useState<string>(ServiceType.DISINFECTION);
  const [cadenceMonths, setCadenceMonths] = useState("3");
  const [nextDueAt, setNextDueAt] = useState("");
  const [description, setDescription] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [scheduleId, setScheduleId] = useState("");

  const scheduleParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE }),
    [page],
  );
  const recordParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE }),
    [page],
  );

  const schedulesQuery = useFoodSchedulesControllerList(scheduleParams);
  const recordsQuery = useFoodRecordsControllerList(recordParams);
  const sitesQuery = useSitesControllerList({ page: 1, pageSize: 100 });
  const createSchedule = useFoodSchedulesControllerCreate();
  const updateSchedule = useFoodSchedulesControllerUpdate();
  const createRecord = useFoodRecordsControllerCreate();

  const schedules = (schedulesQuery.data?.data.items ?? []) as FoodScheduleItem[];
  const records = (recordsQuery.data?.data.items ?? []) as FoodRecordItem[];
  const scheduleTotal = schedulesQuery.data?.data.total ?? 0;
  const recordTotal = recordsQuery.data?.data.total ?? 0;
  const sites = sitesQuery.data?.data.items ?? [];

  async function handleCreateSchedule() {
    try {
      await createSchedule.mutateAsync({
        data: {
          siteId,
          serviceType: serviceType as (typeof SERVICES)[number],
          cadenceMonths: Number(cadenceMonths),
          nextDueAt,
        },
      });
      toast.success(t("toast.scheduleCreated"));
      setCreateScheduleOpen(false);
      void queryClient.invalidateQueries({
        queryKey: getFoodSchedulesControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  async function toggleActive(row: FoodScheduleItem) {
    try {
      await updateSchedule.mutateAsync({
        id: row.id,
        data: { active: !row.active },
      });
      void queryClient.invalidateQueries({
        queryKey: getFoodSchedulesControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  async function handleCreateRecord() {
    try {
      await createRecord.mutateAsync({
        data: {
          siteId,
          scheduleId: scheduleId || null,
          collectedAt,
          sampleDescription: description,
        },
      });
      toast.success(t("toast.recordCreated"));
      setCreateRecordOpen(false);
      void queryClient.invalidateQueries({
        queryKey: getFoodRecordsControllerListQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: getFoodSchedulesControllerListQueryKey(),
      });
    } catch (error) {
      if (isApiRequestError(error)) toast.error(translateApiError(te, error.code));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="food-page">
      <PageHeader
        title={t("title")}
        actions={
          tab === "schedules" ? (
            <PrimaryNewButton
              type="button"
              data-testid="food-new-schedule"
              onClick={() => setCreateScheduleOpen(true)}
            >
              {t("newSchedule")}
            </PrimaryNewButton>
          ) : (
            <PrimaryNewButton
              type="button"
              data-testid="food-new-record"
              onClick={() => setCreateRecordOpen(true)}
            >
              {t("newRecord")}
            </PrimaryNewButton>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="schedules" data-testid="food-tab-schedules">
            {t("tabs.schedules")}
          </TabsTrigger>
          <TabsTrigger value="records" data-testid="food-tab-records">
            {t("tabs.records")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-4">
          {schedules.length === 0 ? (
            <EmptyState message={t("emptySchedules")} />
          ) : (
            <ResponsiveList
              table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.site")}</TableHead>
                  <TableHead>{t("columns.cadence")}</TableHead>
                  <TableHead>{t("columns.nextDue")}</TableHead>
                  <TableHead>{t("columns.active")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-[#0F172A]">{row.siteName ?? t("emDash")}</TableCell>
                    <TableCell>{row.cadenceMonths}</TableCell>
                    <TableCell>{formatIsoDate(row.nextDueAt)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void toggleActive(row)}
                      >
                        {row.active ? t("activeYes") : t("activeNo")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              }
              cards={
                <ul className="space-y-3">
                  {schedules.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-[#E2E8F0] bg-[#ffffff] p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate font-semibold text-[#0F172A]">
                          {row.siteName ?? t("emDash")}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleActive(row)}
                        >
                          {row.active ? t("activeYes") : t("activeNo")}
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs tabular-nums text-[#64748B]">
                        <span>
                          {t("columns.cadence")}: {row.cadenceMonths}
                        </span>
                        <span>{formatIsoDate(row.nextDueAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={scheduleTotal}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          {records.length === 0 ? (
            <EmptyState message={t("emptyRecords")} />
          ) : (
            <ResponsiveList
              table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.site")}</TableHead>
                  <TableHead>{t("columns.collectedAt")}</TableHead>
                  <TableHead>{t("columns.description")}</TableHead>
                  <TableHead>{t("columns.result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((row) => (
                  <TableRow
                    key={row.id}
                    interactive
                    onClick={() => setSelectedRecord(row)}
                  >
                    <TableCell className="font-medium text-[#0F172A]">{row.siteName ?? t("emDash")}</TableCell>
                    <TableCell>{formatIsoDate(row.collectedAt)}</TableCell>
                    <TableCell>{row.sampleDescription}</TableCell>
                    <TableCell>
                      <StatusBadge variant={resultVariant(row.resultStatus)}>
                        {t(`result.${row.resultStatus}`)}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              }
              cards={
                <ul className="space-y-3">
                  {records.map((row) => (
                    <li key={row.id}>
                      <MobileListCard onClick={() => setSelectedRecord(row)}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate font-semibold text-[#0F172A]">
                            {row.siteName ?? t("emDash")}
                          </p>
                          <StatusBadge variant={resultVariant(row.resultStatus)}>
                            {t(`result.${row.resultStatus}`)}
                          </StatusBadge>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-[#64748B]">
                          {row.sampleDescription}
                        </p>
                        <p className="mt-2.5 text-xs tabular-nums text-[#64748B]">
                          {formatIsoDate(row.collectedAt)}
                        </p>
                      </MobileListCard>
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={recordTotal}
            onPageChange={setPage}
          />
        </TabsContent>
      </Tabs>

      <Drawer
        open={createScheduleOpen}
        onOpenChange={setCreateScheduleOpen}
        title={t("newSchedule")}
      >
        <div className="flex flex-col gap-3 p-4">
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
          <FormField label={t("fields.cadenceMonths")}>
            <Input value={cadenceMonths} onChange={(e) => setCadenceMonths(e.target.value)} />
          </FormField>
          <FormField label={t("fields.nextDueAt")}>
            <Input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
          </FormField>
          <Button type="button" onClick={() => void handleCreateSchedule()}>
            {t("save")}
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={createRecordOpen}
        onOpenChange={setCreateRecordOpen}
        title={t("newRecord")}
      >
        <div className="flex flex-col gap-3 p-4">
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
          <FormField label={t("fields.schedule")}>
            <Select
              value={scheduleId || "__none"}
              onValueChange={(v) => setScheduleId(v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("emDash")}</SelectItem>
                {schedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.siteName}
                    {t("sep")}
                    {formatIsoDate(s.nextDueAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("fields.collectedAt")}>
            <Input
              type="date"
              value={collectedAt}
              onChange={(e) => setCollectedAt(e.target.value)}
            />
          </FormField>
          <FormField label={t("fields.sampleDescription")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <Button type="button" onClick={() => void handleCreateRecord()}>
            {t("save")}
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={!!selectedRecord}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
        title={selectedRecord?.sampleDescription ?? ""}
      >
        {selectedRecord ? (
          <div className="flex flex-col gap-2 p-4 text-sm">
            <p>
              {t("fields.collectedAt")}
              {t("colon")}
              {formatIsoDate(selectedRecord.collectedAt)}
            </p>
            <p>
              {t("fields.resultStatus")}
              {t("colon")}
              <StatusBadge variant={resultVariant(selectedRecord.resultStatus)}>
                {t(`result.${selectedRecord.resultStatus}`)}
              </StatusBadge>
            </p>
            {selectedRecord.resultStatus !== FoodResultStatus.PENDING ? (
              <p className="text-ink-muted">{t("frozen")}</p>
            ) : null}
            {selectedRecord.resultUrl ? (
              <a
                href={selectedRecord.resultUrl}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                {t("fields.resultFile")}
              </a>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
