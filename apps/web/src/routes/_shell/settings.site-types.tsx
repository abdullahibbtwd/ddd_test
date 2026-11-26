import type { SiteTypeItem } from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getSiteTypesControllerListQueryKey,
  useSiteTypesControllerCreate,
  useSiteTypesControllerList,
  useSiteTypesControllerUpdate,
} from "@/api/generated/site-types/site-types";
import { isApiRequestError } from "@/api/mutator";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { MobileListCard, PrimaryNewButton, ResponsiveList } from "@/components/list-chrome";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_shell/settings/site-types")({
  component: SiteTypesSettingsPage,
});

type DrawerTarget = { mode: "create" } | { mode: "edit"; item: SiteTypeItem };

function SiteTypesSettingsPage() {
  const { t } = useTranslation("sites");
  const { t: tc } = useTranslation("common");
  const { t: te } = useTranslation("errors");
  const queryClient = useQueryClient();

  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();

  const { data, isLoading, isError } = useSiteTypesControllerList({ includeInactive: true });
  const createMutation = useSiteTypesControllerCreate();
  const updateMutation = useSiteTypesControllerUpdate();
  const items = (data?.data.items ?? []) as SiteTypeItem[];

  const drawerOpen = drawerTarget !== null;
  const isCreate = drawerTarget?.mode === "create";
  const editing = drawerTarget?.mode === "edit" ? drawerTarget.item : null;

  useEffect(() => {
    if (!drawerTarget) return;
    setNameError(undefined);
    if (drawerTarget.mode === "create") {
      setName("");
      return;
    }
    setName(drawerTarget.item.name);
  }, [drawerTarget]);

  function showApiError(err: unknown) {
    if (isApiRequestError(err)) {
      toast.error(te(err.code, { defaultValue: err.message }));
      return;
    }
    toast.error(te("unknown"));
  }

  async function handleSave() {
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setNameError(t("types.nameRequired"));
      return;
    }
    try {
      if (isCreate) {
        await createMutation.mutateAsync({ data: { name: trimmed } });
      } else if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: { name: trimmed } });
      }
      await queryClient.invalidateQueries({ queryKey: getSiteTypesControllerListQueryKey() });
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function toggleActive(item: SiteTypeItem) {
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        data: { isActive: !item.isActive },
      });
      await queryClient.invalidateQueries({ queryKey: getSiteTypesControllerListQueryKey() });
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <PrimaryNewButton onClick={() => setDrawerTarget({ mode: "create" })}>
          {t("types.newType")}
        </PrimaryNewButton>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted">{t("types.empty")}</p>
      ) : isError || items.length === 0 ? (
        <EmptyState message={t("types.empty")} />
      ) : (
        <ResponsiveList
          table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("types.name")}</TableHead>
              <TableHead>{t("types.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow
                key={row.id}
                interactive
                tabIndex={0}
                role="button"
                onClick={() => setDrawerTarget({ mode: "edit", item: row })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDrawerTarget({ mode: "edit", item: row });
                  }
                }}
              >
                <TableCell className="font-medium text-[#0F172A]">{row.name}</TableCell>
                <TableCell>
                  <StatusBadge variant={row.isActive ? "ok" : "neutral"}>
                    {row.isActive ? t("types.active") : t("types.inactive")}
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
                      {row.isActive ? t("types.active") : t("types.inactive")}
                    </StatusBadge>
                  </div>
                </MobileListCard>
              </li>
            ))}
          </ul>
          }
        />
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) setDrawerTarget(null);
        }}
        title={isCreate ? t("types.drawerCreate") : t("types.drawerEdit")}
        footer={
          <Button
            className="w-full"
            onClick={() => void handleSave()}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {tc("actions.save")}
          </Button>
        }
      >
        <div className="space-y-4">
          <FormField label={t("types.name")} required error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          {editing ? (
            <Button type="button" variant="secondary" onClick={() => void toggleActive(editing)}>
              {editing.isActive ? t("types.deactivate") : t("types.activate")}
            </Button>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
