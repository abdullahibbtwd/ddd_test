import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatRelativeBg } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function AuditFeed({
  items,
}: {
  items: Array<{
    id: string;
    occurredAt: string;
    actorName: string | null;
    actorLabel: string | null;
    action: string;
    entityType: string;
  }>;
}) {
  const { t } = useTranslation("dashboard");
  const { t: ta } = useTranslation("audit");

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="type-section">{t("sections.recentActivity")}</h2>
        <Link
          to="/settings/audit"
          className="text-sm font-medium text-[#14452F] no-underline hover:underline"
        >
          →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[#64748B]">{t("audit.empty")}</p>
      ) : (
        <ol className="relative space-y-0">
          {items.map((item, index) => {
            const name = item.actorName ?? item.actorLabel ?? t("audit.system");
            const actionLabel =
              ta(`actions.${item.action}` as "actions.CREATE", {
                defaultValue: item.action,
              }) || item.action;
            const entityLabel =
              ta(`entityTypes.${item.entityType}` as "entityTypes.Client", {
                defaultValue: item.entityType,
              }) || item.entityType;

            return (
              <li
                key={item.id}
                className={cn(
                  "relative flex gap-3 pb-4 pl-1",
                  index !== items.length - 1 &&
                    "after:absolute after:top-8 after:bottom-0 after:left-[15px] after:w-px after:bg-[#E2E8F0]",
                )}
              >
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#ffffff] text-[10px] font-semibold text-[#14452F]">
                  {initials(name)}
                </span>
                <div className="min-w-0 flex-1 border-b border-[#E2E8F0]/80 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-[#1E293B]">
                      <span className="font-medium">{name}</span>
                      {" · "}
                      <span>{actionLabel}</span>
                      {" · "}
                      <span className="text-[#64748B]">{entityLabel}</span>
                    </p>
                    <time className="shrink-0 font-mono text-[11px] text-[#94A3B8]">
                      {formatRelativeBg(item.occurredAt)}
                    </time>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
