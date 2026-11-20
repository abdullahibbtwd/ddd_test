import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

export const controlClassName = cn(
  "w-full rounded-control border border-border bg-surface px-3 text-sm text-ink",
  "placeholder:text-ink-muted transition-colors",
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
  "aria-invalid:border-bad-ink aria-invalid:focus-visible:border-bad-ink aria-invalid:focus-visible:outline-bad-ink",
  "disabled:cursor-not-allowed disabled:bg-bg disabled:text-ink-muted",
);

export function Input({
  className,
  type = "text",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} type={type} className={cn(controlClassName, "h-9", className)} {...props} />;
}
