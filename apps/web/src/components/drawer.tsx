import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Slide-over side. Business drawers are `right`; the mobile nav uses `left`. */
  side?: "right" | "left";
  /** Hide the title visually (still read by screen readers). */
  hideTitle?: boolean;
  className?: string;
}

/** Slide-over panel built on Radix Dialog. One of the only elements allowed a shadow. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  hideTitle = false,
  className,
}: DrawerProps) {
  const { t } = useTranslation();
  const isRight = side === "right";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-ink/30",
            "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
          )}
        />
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-y-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-overlay",
            isRight
              ? "right-0 border-l border-border data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out sm:max-w-lg"
              : "left-0 max-w-xs border-r border-border data-[state=open]:animate-drawer-left-in data-[state=closed]:animate-drawer-left-out",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className={cn("min-w-0", hideTitle && "sr-only")}>
              <DialogPrimitive.Title className="type-section">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("actions.close")} className="-mt-1 -mr-2 ml-auto">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer ? (
            <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
