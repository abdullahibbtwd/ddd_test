import { Toaster as SonnerToaster } from "sonner";

/** Sonner, restyled to tokens: hairline border, no shadow, 6px radius. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-control border border-border bg-surface px-4 py-3 text-sm text-ink",
          title: "font-medium text-ink",
          description: "text-ink-muted",
          success: "border-ok-ink/40!",
          error: "border-bad-ink/40!",
          warning: "border-warn-ink/40!",
          actionButton:
            "h-8 rounded-control bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-hover",
          cancelButton: "h-8 rounded-control border border-border px-3 text-sm",
        },
      }}
    />
  );
}
