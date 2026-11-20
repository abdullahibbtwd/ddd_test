import type { Ref, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { controlClassName } from "./input";

export function Textarea({
  className,
  rows = 4,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlClassName, "min-h-20 resize-y py-2", className)}
      {...props}
    />
  );
}
