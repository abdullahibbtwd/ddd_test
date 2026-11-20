import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Table: hairline dividers, 12px muted headers, py-3 rows, hover tint. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-control border border-border bg-surface">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={className} {...props} />;
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
      className={cn("transition-colors hover:bg-bg", interactive && "cursor-pointer", className)}
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
        "label border-b border-border px-4 py-3 whitespace-nowrap",
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
        "type-body border-b border-border px-4 py-3 align-middle",
        numeric && "num text-right whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}
