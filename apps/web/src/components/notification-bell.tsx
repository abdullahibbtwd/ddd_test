import {
  NotificationKind,
  buildBodyParams,
  notificationTargetPath,
  type NotificationItem,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getNotificationsControllerMeQueryKey,
  useNotificationsControllerDismiss,
  useNotificationsControllerMe,
  useNotificationsControllerRead,
} from "@/api/generated/notifications/notifications";
import { Drawer } from "@/components/drawer";
import { NotificationFeedItem } from "@/components/notification-item";
import { Button } from "@/components/ui/button";
import { BELL_POLL_MS } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const BELL_PARAMS = { unreadOnly: true, page: 1, pageSize: 20 } as const;

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return phone;
}

export function NotificationBell() {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const query = useNotificationsControllerMe(BELL_PARAMS, {
    query: { refetchInterval: BELL_POLL_MS },
  });
  const read = useNotificationsControllerRead();
  const dismiss = useNotificationsControllerDismiss();
  const items = (query.data?.data.items ?? []) as NotificationItem[];
  const total = query.data?.data.total ?? items.length;

  useEffect(() => {
    if (!open || phone) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phone]);

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: getNotificationsControllerMeQueryKey(),
    });
  }

  async function openItem(item: NotificationItem) {
    await read.mutateAsync({ id: item.id });
    await refresh();
    setOpen(false);
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
      await navigate({
        to: "/agreements",
        search: { agreementId: item.entityId },
      });
      return;
    }
    if (item.kind === NotificationKind.FOOD_SCHEDULE_DUE) {
      await navigate({ to: "/food" });
      return;
    }
    await navigate({ to: "/invoices/$id", params: { id: item.entityId } });
    void notificationTargetPath(item);
  }

  async function dismissItem(item: NotificationItem) {
    await dismiss.mutateAsync({ id: item.id });
    await refresh();
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void query.refetch();
  }

  function renderFeed(opts?: { showHeader?: boolean }) {
    const showHeader = opts?.showHeader !== false;
    return (
      <div className="flex max-h-[min(28rem,70vh)] flex-col">
        {showHeader ? (
          <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0]/80 px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-[#0F172A]">
                {t("bell.label")}
              </h2>
              <p className="text-xs text-[#94A3B8]">
                {total > 0 ? t("bell.unreadCount", { count: total }) : t("bell.empty")}
              </p>
            </div>
            {total > 0 ? (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#14452F] px-2 text-[11px] font-semibold text-[#ffffff] tabular-nums">
                {total}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-[#E8F1ED] text-[#14452F]">
                <CheckCheck className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-[#334155]">{t("bell.empty")}</p>
              <p className="text-xs text-[#94A3B8]">{t("bell.emptyHint")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]/80">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationFeedItem
                    item={item}
                    compact
                    onOpen={() => void openItem(item)}
                    onDismiss={() => void dismissItem(item)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-[#E2E8F0]/80 bg-[#F8FAFC] px-4 py-2.5">
          <Link
            to="/notifications"
            data-testid="notification-see-all"
            className="block text-center text-sm font-medium text-[#14452F] no-underline hover:underline"
            onClick={() => setOpen(false)}
          >
            {t("bell.seeAll")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("bell.label")}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="notification-bell"
        className={cn(
          "relative text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
          open && "bg-[#F1F5F9] text-[#0F172A]",
        )}
        onClick={toggle}
      >
        <Bell className="size-[1.15rem]" />
        {total > 0 ? (
          <span
            data-testid="notification-bell-count"
            className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C48A1A] px-1 text-[10px] font-semibold text-[#ffffff] tabular-nums ring-2 ring-[#ffffff]"
          >
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </Button>

      {open && phone ? (
        <Drawer
          open
          onOpenChange={setOpen}
          title={t("bell.label")}
          className="inset-0 w-screen max-w-none sm:max-w-none"
        >
          <div data-testid="notification-bell-sheet" className="-mx-4">
            {renderFeed({ showHeader: false })}
          </div>
        </Drawer>
      ) : null}

      {open && !phone ? (
        <div
          data-testid="notification-popover"
          role="dialog"
          aria-labelledby={titleId}
          className="absolute right-0 z-40 mt-2 w-[22.5rem] overflow-hidden rounded-xl border border-[#E2E8F0]/90 bg-[#ffffff] shadow-[0_12px_40px_rgb(15_23_42/0.12)]"
        >
          {renderFeed({ showHeader: true })}
        </div>
      ) : null}
    </div>
  );
}
