import { Plus, Search } from "lucide-react";
import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shared control height/radius for list filter toolbars. */
export const listFilterControlClass =
  "h-10 rounded-lg border-[#E2E8F0] bg-[#ffffff] text-sm shadow-none focus-visible:border-[#14452F] focus-visible:outline-[#14452F]";

export function SoftPill({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#475569]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function ListToolbar({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ListSearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative min-w-0 flex-1 sm:min-w-[16rem]", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#94A3B8]"
        aria-hidden="true"
      />
      <Input {...props} className={cn(listFilterControlClass, "pl-9", props.className)} />
    </div>
  );
}

export function PrimaryNewButton({
  children,
  className,
  ...props
}: ButtonProps & { children: ReactNode }) {
  return (
    <Button
      className={cn(
        "h-10 rounded-lg bg-[#14452F] px-4 text-sm font-medium text-[#ffffff] hover:bg-[#165239]",
        className,
      )}
      {...props}
    >
      <Plus className="size-4" aria-hidden="true" />
      {children}
    </Button>
  );
}

/** Desktop table + mobile card stack switcher. */
export function ResponsiveList({
  table,
  cards,
}: {
  table: ReactNode;
  cards: ReactNode;
}) {
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </>
  );
}

export function MobileListCard({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-xl border border-[#E2E8F0] bg-[#ffffff] p-4 text-left shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
        "transition-colors hover:border-[#14452F]/25 hover:bg-[#F8FAFC]/60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
