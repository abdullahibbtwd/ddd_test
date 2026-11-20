import {
  Role,
  formatPhone,
  PhoneValidationError,
  type UserItem,
  type UserListQuery,
} from "@ddcrm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAreasControllerList } from "@/api/generated/areas/areas";
import {
  getUsersControllerListQueryKey,
  useUsersControllerCreate,
  useUsersControllerList,
  useUsersControllerResetPassword,
  useUsersControllerUpdate,
} from "@/api/generated/users/users";
import { isApiRequestError } from "@/api/mutator";
import { CheckboxGroup } from "@/components/checkbox-group";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FormField } from "@/components/form-field";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { TemporaryPasswordDialog } from "@/components/temporary-password-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_shell/settings/users")({
  component: UsersSettingsPage,
});

const PAGE_SIZE = 20;
const ROLES = [Role.ADMIN, Role.OFFICE, Role.FIELD] as const;

function formatLastLogin(iso: string | null, emDash: string): string {
  if (!iso) return emDash;
  try {
    return new Intl.DateTimeFormat("bg-BG", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return emDash;
  }
}

function formatPhoneCell(phone: string | null, emDash: string): string {
  if (!phone) return emDash;
  try {
    return formatPhone(phone);
  } catch (err) {
    if (err instanceof PhoneValidationError) return phone;
    return emDash;
  }
}

function areasCellLabel(
  item: UserItem,
  t: ReturnType<typeof useTranslation<"users">>["t"],
): string {
  if (item.areas.length === 0) return t("emDash");
  if (item.areas.length <= 2) return item.areas.map((a) => a.name).join(", ");
  return t("areasSummary", { count: item.areas.length });
}

type DrawerTarget = { mode: "create" } | { mode: "edit"; item: UserItem };

function UsersSettingsPage() {
  const { t } = useTranslation("users");
  const { t: tc } = useTranslation("common");
  const { t: te } = useTranslation("errors");
  const { user: me } = useRouteContext({ from: "/_shell" });
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>(Role.OFFICE);
  const [areaIds, setAreaIds] = useState<string[]>([]);

  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const listQuery = useMemo((): UserListQuery => {
    const q: UserListQuery = { page, pageSize: PAGE_SIZE, isActive: undefined };
    if (search.trim()) q.search = search.trim();
    if (roleFilter) q.role = roleFilter as Role;
    if (statusFilter === "active") q.isActive = true;
    else if (statusFilter === "inactive") q.isActive = false;
    if (areaFilter) q.areaId = areaFilter;
    return q;
  }, [page, search, roleFilter, statusFilter, areaFilter]);

  const { data, isLoading, isError } = useUsersControllerList(listQuery);
  const { data: areasData } = useAreasControllerList({ page: 1, pageSize: 100, isActive: true });

  const createMutation = useUsersControllerCreate({
    mutation: { gcTime: 0 },
  });
  const updateMutation = useUsersControllerUpdate();
  const resetMutation = useUsersControllerResetPassword({
    mutation: { gcTime: 0 },
  });

  const items = data?.data.items ?? [];
  const total = data?.data.total ?? 0;
  const areaOptions = areasData?.data.items ?? [];

  const drawerOpen = drawerTarget !== null;
  const isCreate = drawerTarget?.mode === "create";
  const editing = drawerTarget?.mode === "edit" ? drawerTarget.item : null;
  const isSelf = editing?.id === me.id;

  useEffect(() => {
    if (!drawerTarget) return;
    if (drawerTarget.mode === "create") {
      setName("");
      setEmail("");
      setPhone("");
      setRole(Role.OFFICE);
      setAreaIds([]);
      return;
    }
    const item = drawerTarget.item;
    setName(item.name);
    setEmail(item.email);
    setPhone(item.phone ?? "");
    setRole(item.role);
    setAreaIds(item.areas.map((a) => a.id));
  }, [drawerTarget]);

  function showApiError(err: unknown) {
    if (isApiRequestError(err)) {
      const message = te(err.code, { defaultValue: err.message });
      toast.error(message);
      return;
    }
    toast.error(te("unknown"));
  }

  async function handleSave() {
    try {
      if (isCreate) {
        const result = await createMutation.mutateAsync({
          data: {
            email,
            name: name.trim(),
            phone: phone.trim() || null,
            role,
            ...(role === Role.FIELD ? { areaIds } : {}),
          },
        });
        await queryClient.invalidateQueries({ queryKey: getUsersControllerListQueryKey() });
        setDrawerTarget(null);
        setTempPassword({
          email: result.data.email,
          password: result.data.temporaryPassword,
        });
        return;
      }
      if (!editing) return;
      await updateMutation.mutateAsync({
        id: editing.id,
        data: {
          name: name.trim(),
          phone: phone.trim() || null,
          ...(isSelf ? {} : { role }),
          ...(role === Role.FIELD ? { areaIds } : { areaIds: [] }),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getUsersControllerListQueryKey() });
      setDrawerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleResetPassword() {
    if (!editing) return;
    try {
      const result = await resetMutation.mutateAsync({ id: editing.id });
      setResetConfirm(false);
      setDrawerTarget(null);
      setTempPassword({
        email: editing.email,
        password: result.data.temporaryPassword,
      });
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleToggleActive() {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        data: { isActive: !editing.isActive },
      });
      await queryClient.invalidateQueries({ queryKey: getUsersControllerListQueryKey() });
      setToggleConfirm(false);
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
          <Button onClick={() => setDrawerTarget({ mode: "create" })}>{t("newUser")}</Button>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="users-search">{t("filters.search")}</Label>
          <Input
            id="users-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("filters.searchPlaceholder")}
            className="w-48"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("filters.role")}</Label>
          <Select
            value={roleFilter || "__all"}
            onValueChange={(v) => {
              setRoleFilter(v === "__all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("filters.roleAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("filters.roleAll")}</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("filters.status")}</Label>
          <Select
            value={statusFilter || "__all"}
            onValueChange={(v) => {
              setStatusFilter(v === "__all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("filters.statusAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("filters.statusAll")}</SelectItem>
              <SelectItem value="active">{t("status.active")}</SelectItem>
              <SelectItem value="inactive">{t("status.inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("filters.area")}</Label>
          <Select
            value={areaFilter || "__all"}
            onValueChange={(v) => {
              setAreaFilter(v === "__all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("filters.areaAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("filters.areaAll")}</SelectItem>
              {areaOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      {isLoading ? (
        <p className="text-sm text-ink-muted">{t("empty")}</p>
      ) : isError ? (
        <EmptyState message={t("empty")} />
      ) : items.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.role")}</TableHead>
                <TableHead>{t("columns.areas")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("columns.phone")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("columns.lastLogin")}</TableHead>
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
                  <TableCell>
                    <span className="block font-medium">{row.name}</span>
                    <span className="block text-xs text-ink-muted">{row.email}</span>
                  </TableCell>
                  <TableCell>{t(`roles.${row.role}`)}</TableCell>
                  <TableCell>{areasCellLabel(row, t)}</TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    {formatPhoneCell(row.phone, t("emDash"))}
                  </TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    {formatLastLogin(row.lastLoginAt, t("emDash"))}
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
          <Button disabled={saving || !name.trim() || (isCreate && !email.trim())} onClick={handleSave}>
            {saving ? "…" : tc("actions.save")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <FormField label={t("drawer.name")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t("drawer.email")} required={isCreate}>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!isCreate}
              className={!isCreate ? "bg-bg text-ink-muted" : undefined}
            />
          </FormField>
          <FormField label={t("drawer.phone")}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label={t("drawer.role")}>
            <Select
              value={role}
              disabled={Boolean(isSelf)}
              onValueChange={(v) => {
                const next = v as Role;
                setRole(next);
                if (next !== Role.FIELD) setAreaIds([]);
              }}
            >
              <SelectTrigger title={isSelf ? t("drawer.selfModificationHint") : undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {role === Role.FIELD ? (
            <FormField
              label={t("drawer.areas")}
              hint={
                areaIds.length === 0 ? (
                  <span className="text-ink-muted">{t("drawer.noAreasHint")}</span>
                ) : undefined
              }
            >
              <CheckboxGroup
                options={areaOptions.map((a) => ({ value: a.id, label: a.name }))}
                value={areaIds}
                onChange={setAreaIds}
              />
            </FormField>
          ) : null}

          {!isCreate && editing ? (
            <div className="mt-2 border-t border-border pt-4">
              <p className="type-section mb-3 text-sm">{t("drawer.actionsSection")}</p>
              <div className="flex flex-col items-start gap-2">
                <Button variant="ghost" onClick={() => setResetConfirm(true)}>
                  {t("drawer.resetPassword")}
                </Button>
                <span title={isSelf ? t("drawer.selfModificationHint") : undefined}>
                  <Button
                    variant="ghost"
                    disabled={isSelf}
                    onClick={() => setToggleConfirm(true)}
                  >
                    {editing.isActive ? t("drawer.deactivate") : t("drawer.activate")}
                  </Button>
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        open={resetConfirm}
        onOpenChange={setResetConfirm}
        title={t("confirm.resetPasswordTitle")}
        description={
          editing ? t("confirm.resetPasswordDescription", { name: editing.name }) : undefined
        }
        onConfirm={handleResetPassword}
        loading={resetMutation.isPending}
      />

      <ConfirmDialog
        open={toggleConfirm}
        onOpenChange={setToggleConfirm}
        title={editing?.isActive ? t("confirm.deactivateTitle") : t("confirm.activateTitle")}
        description={
          editing
            ? editing.isActive
              ? t("confirm.deactivateDescription", { name: editing.name })
              : t("confirm.activateDescription", { name: editing.name })
            : undefined
        }
        destructive={editing?.isActive}
        onConfirm={handleToggleActive}
        loading={updateMutation.isPending}
      />

      <TemporaryPasswordDialog
        open={tempPassword !== null}
        onOpenChange={(open) => {
          if (!open) setTempPassword(null);
        }}
        email={tempPassword?.email ?? ""}
        temporaryPassword={tempPassword?.password ?? ""}
      />
    </div>
  );
}