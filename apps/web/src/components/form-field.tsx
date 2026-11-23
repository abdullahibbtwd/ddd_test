import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FormFieldProps {
  label: ReactNode;
  /** Single form control (Input, Textarea, Select trigger, Checkbox). It receives id / aria-*. */
  children: ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

export function FormField({ label, children, hint, error, required, className }: FormFieldProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const controlId = children.props.id ?? `${baseId}-control`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <>
            {" "}
            <span className="label">{t("form.required")}</span>
          </>
        ) : null}
      </Label>
      {cloneElement(children, {
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-bad-ink">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
