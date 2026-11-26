import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

export const controlClassName = cn(
  "w-full rounded-lg border border-[#E2E8F0] bg-[#ffffff] px-3 text-sm text-[#0F172A]",
  "placeholder:text-[#94A3B8] transition-colors",
  "focus-visible:border-[#14452F] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[#14452F]",
  "aria-invalid:border-bad-ink aria-invalid:focus-visible:border-bad-ink aria-invalid:focus-visible:outline-bad-ink",
  "disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
);

export function Input({
  className,
  type = "text",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} type={type} className={cn(controlClassName, "h-10", className)} {...props} />;
}
