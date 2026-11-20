import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  /** One line of text. */
  message: ReactNode;
  action?: { label: ReactNode; onClick: () => void };
  className?: string;
}

/** One line + optional button. No illustration. */
export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 px-4 py-16 text-center", className)}
    >
      <p className="text-sm text-ink-muted">{message}</p>
      {action ? (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
