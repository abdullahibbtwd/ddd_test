import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MoneyAmount } from "@/components/dashboard/money-amount";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function CashPositionStrip({
  collected,
  handedOver,
  outstanding,
}: {
  collected: number;
  handedOver: number;
  outstanding: number;
}) {
  const { t } = useTranslation("dashboard");
  const cells = [
    { label: t("cash.collected"), value: collected },
    { label: t("cash.handedOver"), value: handedOver },
    { label: t("cash.balance"), value: outstanding, emphasize: true },
  ] as const;

  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8F0]/80 border-l-4 border-l-[#14452F] bg-[#ffffff] shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex items-center justify-between border-b border-[#E2E8F0]/80 px-5 py-3">
        <h2 className="type-section">{t("sections.cashPosition")}</h2>
        <Link
          to="/cash"
          className="text-sm font-medium text-[#14452F] no-underline hover:underline"
        >
          →
        </Link>
      </div>
      <div className="grid divide-y divide-[#E2E8F0]/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {cells.map((cell) => (
          <div key={cell.label} className="px-5 py-4">
            <p className="text-xs font-medium text-[#64748B]">{cell.label}</p>
            <div className="mt-1.5">
              <MoneyAmount
                amount={cell.value}
                size="md"
                majorClassName={cn(
                  "emphasize" in cell && cell.emphasize && cell.value > 0
                    ? "text-[#8A5A12]"
                    : undefined,
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CashEmployeesList({
  employees,
}: {
  employees: Array<{
    employeeId: string;
    employeeName: string;
    collected: number;
    handedOver: number;
    outstanding: number;
  }>;
}) {
  const { t } = useTranslation("dashboard");

  return (
    <section className="rounded-xl border border-[#E2E8F0]/80 bg-[#ffffff] p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="type-section">{t("sections.cashByEmployee")}</h2>
        <Link
          to="/cash"
          className="text-sm font-medium text-[#14452F] no-underline hover:underline"
        >
          →
        </Link>
      </div>
      {employees.length === 0 ? (
        <p className="text-sm text-[#64748B]">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0]/80 text-xs text-[#64748B]">
                <th className="py-2 pr-3 font-medium">{t("cash.employee")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("cash.collected")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("cash.handedOver")}</th>
                <th className="py-2 text-right font-medium">{t("cash.outstanding")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const hot = emp.outstanding > 0;
                return (
                  <tr
                    key={emp.employeeId}
                    className="border-b border-[#E2E8F0]/60 last:border-0"
                  >
                    <td className="py-2.5 pr-3">
                      <Link
                        to="/cash"
                        className="flex items-center gap-2.5 text-[#0F172A] no-underline hover:no-underline"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E8F1ED] text-[10px] font-semibold text-[#14452F]">
                          {initials(emp.employeeName)}
                        </span>
                        <span className="truncate font-medium">{emp.employeeName}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <MoneyAmount amount={emp.collected} size="sm" />
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <MoneyAmount amount={emp.handedOver} size="sm" />
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5",
                          hot && "bg-[#F8EED7]",
                        )}
                      >
                        <MoneyAmount
                          amount={emp.outstanding}
                          size="sm"
                          majorClassName={hot ? "text-[#8A5A12]" : undefined}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
