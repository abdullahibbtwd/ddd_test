import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface CheckboxGroupOption {
  value: string;
  label: ReactNode;
}

export interface CheckboxGroupProps {
  options: CheckboxGroupOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
  name?: string;
}

/** Simple vertical list of labeled checkboxes. */
export function CheckboxGroup({
  options,
  value,
  onChange,
  disabled,
  className,
  name,
}: CheckboxGroupProps) {
  function toggle(optionValue: string, checked: boolean) {
    if (checked) {
      onChange([...value, optionValue]);
    } else {
      onChange(value.filter((v) => v !== optionValue));
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {options.map((option) => {
        const id = name ? `${name}-${option.value}` : option.value;
        const checked = value.includes(option.value);
        return (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(state) => toggle(option.value, state === true)}
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">
              {option.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}