import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface TemporaryPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  temporaryPassword: string;
}

/** One-time display of a generated temporary password. */
export function TemporaryPasswordDialog({
  open,
  onOpenChange,
  email,
  temporaryPassword,
}: TemporaryPasswordDialogProps) {
  const { t } = useTranslation("users");
  const [copied, setCopied] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) setCopied(false);
    onOpenChange(next);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-panel border border-border bg-surface p-6 shadow-overlay",
            "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          )}
        >
          <DialogPrimitive.Title className="type-section">{t("tempPassword.title")}</DialogPrimitive.Title>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="label">{t("tempPassword.email")}</p>
              <p className="mt-0.5 break-all">{email}</p>
            </div>
            <div>
              <p className="label">{t("tempPassword.password")}</p>
              <p className="mt-0.5 font-mono text-sm break-all">{temporaryPassword}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{t("tempPassword.hint")}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? t("tempPassword.copied") : t("tempPassword.copy")}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button>{t("tempPassword.done")}</Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}