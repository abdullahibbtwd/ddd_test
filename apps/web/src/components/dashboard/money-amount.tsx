import { formatMoneyParts } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Dual-scale currency: bold major + muted decimals. */
export function MoneyAmount({
  amount,
  className,
  majorClassName,
  minorClassName,
  size = "md",
}: {
  amount: number;
  className?: string;
  majorClassName?: string;
  minorClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { sign, major, minor } = formatMoneyParts(amount);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 tabular-nums",
        size === "lg" && "leading-none",
        className,
      )}
    >
      <span
        className={cn(
          "font-bold text-[#0F172A]",
          size === "lg" && "text-2xl",
          size === "md" && "text-lg",
          size === "sm" && "text-sm",
          majorClassName,
        )}
      >
        {sign}
        {major}
      </span>
      <span
        className={cn(
          "font-medium text-[#94A3B8]",
          size === "lg" && "text-sm",
          size === "md" && "text-xs",
          size === "sm" && "text-[11px]",
          minorClassName,
        )}
      >
        {minor}
      </span>
    </span>
  );
}
