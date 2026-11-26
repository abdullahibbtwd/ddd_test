import {
  NotificationKind,
  NotificationPriority,
  Role,
  buildBodyParams,
  type NotificationItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getNotificationsControllerMeQueryKey,
  useNotificationsControllerDismiss,
  useNotificationsControllerMe,
  useNotificationsControllerRead,
  useNotificationsControllerReadAll,
  useNotificationsControllerSummary,
} from "@/api/generated/notifications/notifications";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { listFilterControlClass } from "@/components/list-chrome";
import { NotificationFeedItem } from "@/components/notification-item";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const KINDS = Object.values(NotificationKind);
const PRIORITIES = Object.values(NotificationPriority);

export function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const { user } = useRouteContext({ from: "/_shell" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user.role === Role.ADMIN;
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [kind, setKind] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");

  const list = useNotificationsControllerMe({
    page,
    pageSize: PAGE_SIZE,
    unreadOnly,
    kind: kind === "all" ? undefined : (kind as NotificationItem["kind"]),
    priority: priority === "all" ? undefined : (priority as NotificationItem["priority"]),
  });
  const summary = useNotificationsControllerSummary(
    {},
    { query: { enabled: isAdmin } },
  );
  const read = useNotificationsControllerRead();
  const dismiss = useNotificationsControllerDismiss();
  const readAll = useNotificationsControllerReadAll();

  const items = (list.data?.data.items ?? []) as NotificationItem[];
  const total = list.data?.data.total ?? 0;
  const summaryKinds = summary.data?.data.kinds ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: getNotificationsControllerMeQueryKey(),
    });
  }

  async function openItem(item: NotificationItem) {
    await read.mutateAsync({ id: item.id });
    await refresh();
    const params = buildBodyParams(item);
    if (item.kind === NotificationKind.CERTIFICATE_EXPIRING) {
      await navigate({
        to: "/certificates",
        search: {
          employeeId: typeof params.employeeId === "string" ? params.employeeId : undefined,
          siteId: typeof params.siteId === "string" ? params.siteId : undefined,
          status: undefined,
          expiringWithin: undefined,
        },
      });
      return;
    }
    if (item.kind === NotificationKind.AGREEMENT_EXPIRING) {
      await navigate({ to: "/agreements", search: { agreementId: item.entityId } });
      return;
    }
    if (item.kind === NotificationKind.FOOD_SCHEDULE_DUE) {
      await navigate({ to: "/food" });
      return;
    }
    await navigate({ to: "/invoices/$id", params: { id: item.entityId } });
  }

  async function dismissItem(item: NotificationItem) {
    await dismiss.mutateAsync({ id: item.id });
    await refresh();
  }

  async function markAll() {
    await readAll.mutateAsync();
    await refresh();
  }

  return (
    <div data-testid="notifications-page" className="space-y-6">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <Button
            type="button"
            variant="secondary"
            data-testid="notifications-mark-all"
            className="gap-2"
            onClick={() => void markAll()}
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            {t("page.markAll")}
          </Button>
        }
      />

      <FilterBar>
        <label
          className={cn(
            "inline-flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#ffffff] px-3 text-sm text-[#334155]",
            unreadOnly && "border-[#14452F]/30 bg-[#E8F1ED] text-[#14452F]",
          )}
        >
          <input
            type="checkbox"
            className="size-3.5 rounded border-[#CBD5E1] accent-[#14452F]"
            data-testid="notifications-filter-unread"
            checked={unreadOnly}
            onChange={(event) => {
              setPage(1);
              setUnreadOnly(event.target.checked);
            }}
          />
          {t("page.unreadOnly")}
        </label>
        <Select
          value={kind}
          onValueChange={(value) => {
            setPage(1);
            setKind(value);
          }}
        >
          <SelectTrigger
            className={cn(listFilterControlClass, "w-full sm:w-52")}
            aria-label={t("page.kind")}
            data-testid="notifications-filter-kind"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("page.kindAll")}</SelectItem>
            {KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`kinds.${value}.title`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priority}
          onValueChange={(value) => {
            setPage(1);
            setPriority(value);
          }}
        >
          <SelectTrigger
            className={cn(listFilterControlClass, "w-full sm:w-40")}
            aria-label={t("page.priority")}
            data-testid="notifications-filter-priority"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("page.priorityAll")}</SelectItem>
            {PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`priority.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] bg-[#ffffff] px-6 py-16 text-center">
          <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-[#E8F1ED] text-[#14452F]">
            <Bell className="size-6" aria-hidden="true" />
          </span>
          <EmptyState message={t("page.empty")} />
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0]/90 bg-[#ffffff] shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
          <ul className="divide-y divide-[#E2E8F0]/80">
            {items.map((item) => (
              <li key={item.id} data-testid={`notification-row-${item.kind}`}>
                <NotificationFeedItem
                  item={item}
                  testIdPrefix="notification-row-open"
                  dismissTestId={`notification-row-dismiss-${item.id}`}
                  onOpen={() => void openItem(item)}
                  onDismiss={() => void dismissItem(item)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {isAdmin ? (
        <section className="space-y-4" data-testid="notifications-summary">
          <div>
            <h2 className="type-section">{t("page.summaryTitle")}</h2>
            <p className="mt-1 text-sm text-[#64748B]">{t("page.summaryHint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryKinds.map((row) => (
              <article
                key={row.kind}
                className="rounded-xl border border-[#E2E8F0]/90 bg-[#ffffff] p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
              >
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  {t(`kinds.${row.kind}.title`)}
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-[#94A3B8]">{t("page.unread")}</dt>
                    <dd className="font-semibold tabular-nums text-[#0F172A]">{row.unread}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#94A3B8]">{t("page.read")}</dt>
                    <dd className="font-semibold tabular-nums text-[#0F172A]">{row.read}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#94A3B8]">{t("page.dismissed")}</dt>
                    <dd className="font-semibold tabular-nums text-[#0F172A]">{row.dismissed}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#94A3B8]">{t("page.clientContact")}</dt>
                    <dd
                      className="font-semibold tabular-nums text-[#14452F]"
                      data-testid={`summary-client-${row.kind}`}
                    >
                      {row.clientContact}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
