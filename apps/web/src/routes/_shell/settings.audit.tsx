import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuditControllerList } from "@/api/generated/audit-log/audit-log";
import type { AuditLogPageDtoOutputItemsItem } from "@/api/generated/model";
import { AuditDrawer } from "@/components/audit/audit-drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import {
  listFilterControlClass,
  MobileListCard,
  ResponsiveList,
} from "@/components/list-chrome";
import { Pagination } from "@/components/pagination";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/settings/audit")({
  component: AuditJournalPage,
});

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "ACCOUNT_LOCKED",
  "REFRESH_REUSE_DETECTED",
] as const;

const ENTITY_OPTIONS = ["users", "auth_sessions", "areas", "user_areas", "clients"] as const;

function shortId(id: string | null | undefined, empty: string): string {
  if (!id) return empty;
  return id.length > 8 ? `${id.slice(0, 8)}\u2026` : id;
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("bg-BG", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function AuditJournalPage() {
  const { t } = useTranslation("audit");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [actorUserId, setActorUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditLogPageDtoOutputItemsItem | null>(null);

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorUserId.trim() ? { actorUserId: actorUserId.trim() } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
    }),
    [page, action, entityType, actorUserId, from, to],
  );

  const { data, isLoading, isError } = useAuditControllerList(query);

  const items = data?.data.items ?? [];
  const total = data?.data.total ?? 0;

  function actionLabel(value: string): string {
    const key = `actions.${value}`;
    const translated = t(key as "actions.CREATE", { defaultValue: value });
    return translated === key ? value : translated;
  }

  function entityLabel(value: string): string {
    const key = `entityTypes.${value}`;
    const translated = t(key as "entityTypes.users", { defaultValue: value });
    return translated === key ? value : translated;
  }

  return (
    <div>
      <FilterBar>
        <Input
            aria-label={t("filters.user")}
          id="audit-actor"
          value={actorUserId}
          onChange={(e) => {
            setActorUserId(e.target.value);
            setPage(1);
          }}
          placeholder={t("filters.userPlaceholder")}
          className={cn(listFilterControlClass, "w-full sm:w-48 font-mono text-xs")}
        />
        <Select
          value={action || "__all"}
          onValueChange={(v) => {
            setAction(v === "__all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("filters.action")} className={cn(listFilterControlClass, "w-full sm:w-52")}>
            <SelectValue placeholder={t("filters.actionPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.actionPlaceholder")}</SelectItem>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {actionLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={entityType || "__all"}
          onValueChange={(v) => {
            setEntityType(v === "__all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("filters.entityType")} className={cn(listFilterControlClass, "w-full sm:w-44")}>
            <SelectValue placeholder={t("filters.entityTypePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.entityTypePlaceholder")}</SelectItem>
            {ENTITY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {entityLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
            aria-label={t("filters.from")}
          id="audit-from"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className={cn(listFilterControlClass, "w-full sm:w-40")}
        />
        <Input
            aria-label={t("filters.to")}
          id="audit-to"
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className={cn(listFilterControlClass, "w-full sm:w-40")}
        />
      </FilterBar>

      {isLoading ? (
        <p className="text-sm text-ink-muted">{t("empty")}</p>
      ) : isError ? (
        <EmptyState message={t("empty")} />
      ) : items.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <>
          <ResponsiveList
            table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead numeric>{t("columns.time")}</TableHead>
                <TableHead>{t("columns.user")}</TableHead>
                <TableHead>{t("columns.action")}</TableHead>
                <TableHead>{t("columns.entity")}</TableHead>
                <TableHead>{t("columns.record")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow
                  key={row.id}
                  interactive
                  onClick={() => setSelected(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(row);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <TableCell numeric>{formatWhen(row.occurredAt)}</TableCell>
                  <TableCell>{row.actorName ?? t("drawer.system")}</TableCell>
                  <TableCell>{actionLabel(row.action)}</TableCell>
                  <TableCell>
                    {entityLabel(row.entityType)}
                    {row.entityId ? (
                      <span className="ml-1 font-mono text-xs text-ink-muted">
                        {shortId(row.entityId, t("emDash"))}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{shortId(row.id, t("emDash"))}</span>
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
                  <MobileListCard onClick={() => setSelected(row)}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold text-[#0F172A]">
                        {actionLabel(row.action)}
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-[#64748B]">
                        {formatWhen(row.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-[#64748B]">
                      {row.actorName ?? t("drawer.system")} · {entityLabel(row.entityType)}
                      {row.entityId ? (
                        <span className="ml-1 font-mono text-xs">
                          {shortId(row.entityId, t("emDash"))}
                        </span>
                      ) : null}
                    </p>
                  </MobileListCard>
                </li>
              ))}
            </ul>
            }
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      <AuditDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
