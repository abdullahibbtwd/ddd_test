import {
  NotificationKind,
  buildBodyParams,
  type NotificationItem,
} from "@ddcrm/shared";
import {
  Award,
  FileSignature,
  FileText,
  FlaskConical,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import {
  formatRelativeBg,
  notificationCopy,
  priorityBadgeVariant,
} from "@/lib/relative-time";

const KIND_ICON: Record<NotificationItem["kind"], LucideIcon> = {
  [NotificationKind.CERTIFICATE_EXPIRING]: Award,
  [NotificationKind.AGREEMENT_EXPIRING]: FileSignature,
  [NotificationKind.FOOD_SCHEDULE_DUE]: FlaskConical,
  [NotificationKind.INVOICE_OVERDUE]: FileText,
};

const KIND_TONE: Record<
  NotificationItem["kind"],
  { icon: string; accent: string }
> = {
  [NotificationKind.CERTIFICATE_EXPIRING]: {
    icon: "bg-[#FFF8E8] text-[#8A5A12]",
    accent: "border-l-[#C48A1A]",
  },
  [NotificationKind.AGREEMENT_EXPIRING]: {
    icon: "bg-[#E8F1ED] text-[#14452F]",
    accent: "border-l-[#2F6B4F]",
  },
  [NotificationKind.FOOD_SCHEDULE_DUE]: {
    icon: "bg-[#EEF2FF] text-[#4338CA]",
    accent: "border-l-[#6366F1]",
  },
  [NotificationKind.INVOICE_OVERDUE]: {
    icon: "bg-[#F5E1E1] text-[#9B3B3B]",
    accent: "border-l-[#9B3B3B]",
  },
};

export function NotificationFeedItem({
  item,
  onOpen,
  onDismiss,
  testIdPrefix = "notification-item",
  dismissTestId,
  compact = false,
}: {
  item: NotificationItem;
  onOpen: () => void;
  onDismiss: () => void;
  testIdPrefix?: string;
  dismissTestId?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("notifications");
  const params = buildBodyParams(item);
  const Icon = KIND_ICON[item.kind];
  const tone = KIND_TONE[item.kind];
  const unread = item.readAt == null;
  const high = item.priority === "HIGH";

  return (
    <div
      className={cn(
        "group relative flex gap-3 border-l-[3px] transition-colors",
        tone.accent,
        unread ? "bg-[#F8FAFC]" : "bg-[#ffffff]",
        compact ? "px-3 py-3" : "px-4 py-4",
        "hover:bg-[#F1F5F9]/80",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
          tone.icon,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>

      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        data-testid={`${testIdPrefix}-${item.kind}`}
        onClick={onOpen}
      >
        <span className="flex flex-wrap items-center gap-2">
          {unread ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-[#14452F]"
              aria-hidden="true"
            />
          ) : null}
          <StatusBadge
            variant={priorityBadgeVariant(item.priority)}
            data-priority={item.priority}
            className={cn(high && "ring-1 ring-[#E8C56A]/50")}
          >
            {t(`priority.${item.priority}`)}
          </StatusBadge>
          <span className="font-mono text-[11px] text-[#94A3B8]">
            {formatRelativeBg(item.createdAt)}
          </span>
        </span>
        <span
          className={cn(
            "mt-1.5 block text-sm text-[#0F172A]",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {notificationCopy(t, item.titleI18nKey)}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-[#64748B]">
          {notificationCopy(t, item.bodyI18nKey, params)}
        </span>
      </button>

      <button
        type="button"
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8]",
          "opacity-70 transition-colors hover:bg-[#F1F5F9] hover:text-[#475569] group-hover:opacity-100",
        )}
        aria-label={t("page.dismiss")}
        data-testid={dismissTestId ?? `notification-dismiss-${item.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
