import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchSelectOption = {
  id: string;
  label: string;
  sublabel?: string | null;
};

export type SearchSelectProps = {
  value: string | null;
  displayLabel?: string;
  onChange: (id: string | null, option: SearchSelectOption | null) => void;
  onSearch: (query: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
};

/**
 * Lightweight search + pick list. The one allowed new shared component for Sites
 * besides the Leaflet map.
 */
export function SearchSelect({
  value,
  displayLabel,
  onChange,
  onSearch,
  options,
  placeholder,
  loading,
  disabled,
  emptyMessage,
  className,
}: SearchSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => onSearch(query), 250);
    return () => window.clearTimeout(handle);
  }, [query, open, onSearch]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const shown = value && displayLabel ? displayLabel : query;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        placeholder={placeholder}
        value={open || !value ? query : shown}
        onFocus={() => {
          setOpen(true);
          if (value && displayLabel) setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null, null);
          setOpen(true);
        }}
      />
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-border bg-surface py-1 shadow-overlay"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-ink-muted" aria-busy="true">
              {emptyMessage ?? "\u2026"}
            </li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{emptyMessage}</li>
          ) : (
            options.map((opt) => (
              <li key={opt.id} role="option" aria-selected={opt.id === value}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent-tint"
                  onClick={() => {
                    onChange(opt.id, opt);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.sublabel ? (
                    <span className="font-mono text-xs text-ink-muted">{opt.sublabel}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
