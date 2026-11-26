import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-control text-sm font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** Accent is reserved for primary actions. */
        primary: "bg-[#14452F] text-[#ffffff] hover:bg-[#165239]",
        secondary:
          "border border-[#E2E8F0] bg-[#ffffff] text-[#0F172A] hover:bg-[#F8FAFC]",
        ghost: "bg-transparent text-[#0F172A] hover:bg-[#F1F5F9]",
      },
      size: {
        md: "h-10 rounded-lg px-4",
        sm: "h-8 rounded-md px-3",
        icon: "size-10 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
