import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content below the description (e.g. a date input). */
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  /** Colours the confirm button with the "bad" status ink instead of the accent. */
  destructive?: boolean;
  loading?: boolean;
}

/** Centered modal confirmation. One of the only elements allowed a shadow. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-40 bg-ink/30 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out"
        />
        <DialogPrimitive.Content
          role="alertdialog"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-panel border border-border bg-surface p-6 shadow-overlay",
            "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          )}
        >
          <DialogPrimitive.Title className="type-section">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-2 text-sm text-ink-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary">{cancelLabel ?? t("actions.cancel")}</Button>
            </DialogPrimitive.Close>
            <Button
              disabled={loading}
              onClick={onConfirm}
              className={cn(destructive && "bg-bad-ink hover:bg-bad-ink/90")}
            >
              {confirmLabel ?? t("actions.confirm")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
