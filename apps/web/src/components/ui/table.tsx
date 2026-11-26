import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Framed list table: rounded card, slate header, hairline rows, soft hover. */
export function Table({
  className,
  containerClassName,
  ...props
}: HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto overflow-hidden rounded-xl border border-[#E2E8F0]/90 bg-[#ffffff] shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
        containerClassName,
      )}
    >
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[#F8FAFC]", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...props} />;
}

export function TableRow({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-[#F8FAFC]/80",
        interactive && "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  numeric,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-[#E2E8F0] px-4 py-3 text-xs font-semibold tracking-wider text-[#64748B] uppercase whitespace-nowrap",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "border-b border-[#E2E8F0]/80 px-4 py-3 align-middle text-[#1E293B]",
        numeric && "text-right whitespace-nowrap tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
