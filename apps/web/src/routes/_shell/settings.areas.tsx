import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AreaItem, AreaListQuery } from "@ddcrm/shared";
import {
  getAreasControllerListQueryKey,
  useAreasControllerCreate,
  useAreasControllerGetOne,
  useAreasControllerList,
  useAreasControllerUpdate,
} from "@/api/generated/areas/areas";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import {
  ListSearchInput,
  listFilterControlClass,
  MobileListCard,
  PrimaryNewButton,
  ResponsiveList,
} from "@/components/list-chrome";
import { FormField } from "@/components/form-field";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_shell/settings/areas")({
  component: AreasSettingsPage,
});

const PAGE_SIZE = 20;

type DrawerTarget = { mode: "create" } | { mode: "edit"; item: AreaItem };

function AreasSettingsPage() {
  const { t } = useTranslation("areas");
  const { t: tc } = useTranslation("common");
  const { t: te } = useTranslation("errors");
  const { t: tu } = useTranslation("users");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const listQuery = useMemo((): AreaListQuery => {
    const q: AreaListQuery = { page, pageSize: PAGE_SIZE, isActive: undefined };
    if (search.trim()) q.search = search.trim();
    if (statusFilter === "active") q.isActive = true;
    else if (statusFilter === "inactive") q.isActive = false;
    return q;
  }, [page, search, statusFilter]);

  const { data, isLoading, isError } = useAreasControllerList(listQuery);
  const editingId = drawerTarget?.mode === "edit" ? drawerTarget.item.id : "";
  const { data: detailData } = useAreasControllerGetOne(editingId, {
    query: { enabled: editingId.length > 0 },
  });

  const createMutation = useAreasControllerCreate();
  const updateMutation = useAreasControllerUpdate();

  const items = data?.data.items ?? [];
  const total = data?.data.total ?? 0;
  const assignedUsers = detailData?.data.users ?? [];

  const drawerOpen = drawerTarget !== null;
  const isCreate = drawerTarget?.mode === "create";

  useEffect(() => {
    if (!drawerTarget) return;
    if (drawerTarget.mode === "create") {
      setName("");
      setIsActive(true);
      return;
    }
    const item = drawerTarget.item;
    setName(item.name);
    setIsActive(item.isActive);
  }, [drawerTarget]);

  function showApiError(err: unknown) {
    if (isApiRequestError(err)) {
      toast.error(te(err.code, { defaultValue: err.message }));
      return;
    }
    toast.error(te("unknown"));
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (isCreate) {
        await createMutation.mutateAsync({ data: { name: trimmed } });
      } else if (drawerTarget?.mode === "edit") {
        await updateMutation.mutateAsync({
          id: drawerTarget.item.id,
          data: { name: trimmed, isActive },
        });
      }
      await queryClient.invalidateQueries({ queryKey: getAreasControllerListQueryKey() });
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <FilterBar
        trailing={
          <PrimaryNewButton onClick={() => setDrawerTarget({ mode: "create" })}>
            {t("newArea")}
          </PrimaryNewButton>
        }
      >
        <ListSearchInput
          aria-label={t("filters.search")}
          id="areas-search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t("filters.searchPlaceholder")}
        />
        <Select
          value={statusFilter || "__all"}
          onValueChange={(v) => {
            setStatusFilter(v === "__all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label={t("filters.status")} className={cn(listFilterControlClass, "w-full sm:w-40")}>
            <SelectValue placeholder={t("filters.statusAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.statusAll")}</SelectItem>
            <SelectItem value="active">{t("filters.active")}</SelectItem>
            <SelectItem value="inactive">{t("filters.inactive")}</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead numeric>{t("columns.users")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow
                  key={row.id}
                  interactive
                  onClick={() => setDrawerTarget({ mode: "edit", item: row })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDrawerTarget({ mode: "edit", item: row });
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <TableCell className="font-medium text-[#0F172A]">{row.name}</TableCell>
                  <TableCell numeric className="num">
                    {row.userCount ?? 0}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={row.isActive ? "ok" : "neutral"}>
                      {row.isActive ? t("status.active") : t("status.inactive")}
                    </StatusBadge>
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
                  <MobileListCard onClick={() => setDrawerTarget({ mode: "edit", item: row })}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold text-[#0F172A]">{row.name}</p>
                      <StatusBadge variant={row.isActive ? "ok" : "neutral"}>
                        {row.isActive ? t("status.active") : t("status.inactive")}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-[#64748B]">
                      {t("columns.users")}: {row.userCount ?? 0}
                    </p>
                  </MobileListCard>
                </li>
              ))}
            </ul>
            }
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) setDrawerTarget(null);
        }}
        title={isCreate ? t("drawer.createTitle") : t("drawer.editTitle")}
        footer={
          <Button disabled={saving || !name.trim()} onClick={handleSave}>
            {saving ? "…" : tc("actions.save")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <FormField label={t("drawer.name")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          {!isCreate ? (
            <>
              <FormField label={t("drawer.active")}>
                <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              </FormField>
              <div>
                <p className="type-section mb-2 text-sm">{t("drawer.assignedUsers")}</p>
                {assignedUsers.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("drawer.noAssignedUsers")}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {assignedUsers.map((u) => (
                      <li key={u.id}>
                        <span className="font-medium">{u.name}</span>
                        <span className="ml-1 text-ink-muted">
                          {t("drawer.userRole", {
                            role: tu(`roles.${u.role}` as "roles.ADMIN"),
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}