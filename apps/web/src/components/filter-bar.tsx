import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Right-aligned trailing area (e.g. primary action). */
  trailing?: ReactNode;
}

/** Single row of filters above a table. No card, no background. */
export function FilterBar({ className, children, trailing, ...props }: FilterBarProps) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end gap-3", className)} {...props}>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
