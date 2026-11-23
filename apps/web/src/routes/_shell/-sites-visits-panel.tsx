import { VisitStatus, type VisitItem } from "@ddcrm/shared";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVisitsControllerList } from "@/api/generated/visits/visits";
import { useAbility } from "@/auth/ability";
import { Button } from "@/components/ui/button";
import { formatIsoDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SitesVisitsPanelProps = {
  siteId: string;
};

export function SitesVisitsPanel({ siteId }: SitesVisitsPanelProps) {
  const { t } = useTranslation("sites");
  const { t: tv } = useTranslation("visits");
  const ability = useAbility();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const canCreate = ability.can("create", "Visit");

  const listQuery = useVisitsControllerList({ siteId, page, pageSize });
  const items = useMemo(
    () => (listQuery.data?.data.items ?? []) as VisitItem[],
    [listQuery.data],
  );
  const total = listQuery.data?.data.total ?? 0;
  const hasMore = page * pageSize < total;

  return (
    <div className="space-y-4" data-testid="visits-panel">
      {canCreate ? (
        <Button
          className="w-full"
          onClick={() =>
            void navigate({
              to: "/visits/new",
              search: { siteId },
            })
          }
        >
          {t("visits.new")}
        </Button>
      ) : null}

      {items.length === 0 && !listQuery.isLoading ? (
        <p className="text-sm text-ink-muted" data-testid="visits-empty">
          {t("visits.empty")}
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {items.map((visit) => {
          const cancelled = visit.status === VisitStatus.CANCELLED;
          return (
            <li key={visit.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 py-3 text-left",
                  cancelled && "text-ink-muted",
                )}
                onClick={() =>
                  void navigate({
                    to: "/visits/$id/edit",
                    params: { id: visit.id },
                  })
                }
              >
                <span className={cn("text-sm", cancelled && "line-through")}>
                  {formatIsoDate(visit.visitDate)}
                  {t("visits.metaSep")}
                  {tv(`treatmentTypes.${visit.treatmentType}`)}
                  {t("visits.metaSep")}
                  <span className="num">{formatMoney(visit.chargedAmount)}</span>
                  {cancelled ? (
                    <span className="ml-2 text-xs text-ink-muted no-underline">
                      {t("visits.cancelled")}
                    </span>
                  ) : null}
                </span>
                {cancelled && visit.cancelReason ? (
                  <span className="text-xs text-ink-muted">{visit.cancelReason}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setPage((p) => p + 1)}
          disabled={listQuery.isFetching}
        >
          {t("visits.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
