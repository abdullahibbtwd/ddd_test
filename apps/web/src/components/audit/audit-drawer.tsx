import { useTranslation } from "react-i18next";
import type { AuditLogPageDtoOutputItemsItem } from "@/api/generated/model";
import { Drawer } from "@/components/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MASKED_FIELDS = new Set(["password_hash"]);

function formatScalar(value: unknown, masked: boolean, maskedLabel: string): string {
  if (masked) return maskedLabel;
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function AuditDrawer({
  item,
  onClose,
}: {
  item: AuditLogPageDtoOutputItemsItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("audit");
  const open = item !== null;

  const before = asRecord(item?.before);
  const after = asRecord(item?.after);
  const changed = item?.changedFields ?? [];

  const fieldRows =
    item?.action === "UPDATE"
      ? changed.map((field) => ({
          field,
          before: before[field],
          after: after[field],
          masked: MASKED_FIELDS.has(field),
        }))
      : item?.action === "CREATE"
        ? Object.keys(after).map((field) => ({
            field,
            before: undefined,
            after: after[field],
            masked: MASKED_FIELDS.has(field),
          }))
        : item?.action === "DELETE"
          ? Object.keys(before).map((field) => ({
              field,
              before: before[field],
              after: undefined,
              masked: MASKED_FIELDS.has(field),
            }))
          : [];

  function fieldLabel(field: string): string {
    const key = `fields.${field}`;
    const translated = t(key as "fields.email", { defaultValue: field });
    return translated === key ? field : translated;
  }

  function sourceLabel(source: string): string {
    const key = `sources.${source}`;
    const translated = t(key as "sources.api", { defaultValue: source });
    return translated === key ? source : translated;
  }

  function whenLabel(iso: string | undefined): string {
    if (!iso) return t("emDash");
    try {
      return new Intl.DateTimeFormat("bg-BG", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("drawer.title")}
    >
      {item ? (
        <div className="space-y-6">
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="label">{t("drawer.who")}</dt>
              <dd className="mt-0.5">{item.actorName ?? item.actorLabel ?? t("drawer.system")}</dd>
            </div>
            <div>
              <dt className="label">{t("drawer.when")}</dt>
              <dd className="num mt-0.5">{whenLabel(item.occurredAt)}</dd>
            </div>
            <div>
              <dt className="label">{t("drawer.source")}</dt>
              <dd className="mt-0.5">{sourceLabel(item.source)}</dd>
            </div>
            <div>
              <dt className="label">{t("drawer.requestId")}</dt>
              <dd className="mt-0.5 font-mono text-xs">{item.requestId ?? t("emDash")}</dd>
            </div>
          </dl>

          {fieldRows.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("drawer.noChanges")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("drawer.field")}</TableHead>
                  {item.action === "UPDATE" || item.action === "DELETE" ? (
                    <TableHead>{t("drawer.before")}</TableHead>
                  ) : null}
                  {item.action === "UPDATE" || item.action === "CREATE" ? (
                    <TableHead>{t("drawer.after")}</TableHead>
                  ) : null}
                  {item.action !== "UPDATE" &&
                  item.action !== "CREATE" &&
                  item.action !== "DELETE" ? (
                    <TableHead>{t("drawer.value")}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fieldRows.map((row) => (
                  <TableRow key={row.field}>
                    <TableCell>{fieldLabel(row.field)}</TableCell>
                    {item.action === "UPDATE" || item.action === "DELETE" ? (
                      <TableCell className="font-mono text-xs break-all">
                        {formatScalar(row.before, row.masked, t("drawer.masked"))}
                      </TableCell>
                    ) : null}
                    {item.action === "UPDATE" || item.action === "CREATE" ? (
                      <TableCell className="font-mono text-xs break-all">
                        {formatScalar(row.after, row.masked, t("drawer.masked"))}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
