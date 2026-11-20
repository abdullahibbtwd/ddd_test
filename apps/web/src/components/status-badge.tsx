import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const STATUS_VARIANTS = ["ok", "warn", "bad", "neutral"] as const;
export type StatusVariant = (typeof STATUS_VARIANTS)[number];

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        ok: "bg-ok-bg text-ok-ink",
        warn: "bg-warn-bg text-warn-ink",
        bad: "bg-bad-bg text-bad-ink",
        neutral: "bg-neutral-bg text-neutral-ink",
      } satisfies Record<StatusVariant, string>,
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface StatusBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  variant: StatusVariant;
}

/** The ONLY pill-shaped element in the UI. */
export function StatusBadge({ variant, className, ...props }: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-variant={variant}
      className={cn(statusBadgeVariants({ variant }), className)}
      {...props}
    />
  );
}
