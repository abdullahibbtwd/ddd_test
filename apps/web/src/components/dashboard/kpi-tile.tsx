import { Link } from "@tanstack/react-router";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MoneyAmount } from "@/components/dashboard/money-amount";
import { cn } from "@/lib/utils";

const TONE = {
  bad: {
    border: "border-l-[#9B3B3B]",
    icon: "bg-[#F5E1E1] text-[#9B3B3B]",
  },
  warn: {
    border: "border-l-[#C48A1A]",
    icon: "bg-[#F8EED7] text-[#8A5A12]",
  },
  ok: {
    border: "border-l-[#2F6B4F]",
    icon: "bg-[#E6EFE9] text-[#2F6B4F]",
  },
  neutral: {
    border: "border-l-[#94A3B8]",
    icon: "bg-[#EEF0F3] text-[#4B5563]",
  },
} as const;

export function KpiTile({
  to,
  search,
  label,
  count,
  amount,
  icon: Icon,
  tone = "neutral",
  muted = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  to: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  search?: any;
  label: string;
  count: number;
  amount?: number;
  icon: LucideIcon;
  tone?: keyof typeof TONE;
  muted?: boolean;
}) {
  const colors = TONE[tone];
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "group flex min-h-[7.5rem] flex-col rounded-xl border border-[#E2E8F0]/80 bg-[#ffffff] p-4 no-underline",
        "border-l-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-all",
        "hover:border-[#14452F]/35 hover:shadow-[0_6px_18px_rgb(15_23_42/0.06)] hover:no-underline",
        colors.border,
        muted && "opacity-65",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            colors.icon,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <ArrowUpRight
          className="size-4 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#14452F]"
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-xs font-medium text-[#64748B]">{label}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <span className="text-2xl font-bold tabular-nums text-[#0F172A]">{count}</span>
        {amount !== undefined ? (
          <MoneyAmount amount={amount} size="sm" className="justify-end" />
        ) : null}
      </div>
    </Link>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}
