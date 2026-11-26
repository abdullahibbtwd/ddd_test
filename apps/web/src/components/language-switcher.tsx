import { useTranslation } from "react-i18next";
import {
  isSupportedLanguage,
  type SupportedLanguage,
} from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  bg: "Български",
  en: "English",
};

const LANGUAGE_SHORT: Record<SupportedLanguage, string> = {
  bg: "BG",
  en: "EN",
};

export function LanguageSwitcher({
  className,
  variant = "default",
  id = "language-switcher",
}: {
  className?: string;
  variant?: "default" | "pill" | "navbar";
  id?: string;
}) {
  const { t, i18n } = useTranslation();
  const current = isSupportedLanguage(i18n.language) ? i18n.language : "bg";

  if (variant === "pill" || variant === "navbar") {
    const navbar = variant === "navbar";
    return (
      <div className={cn(className)}>
        <Select
          value={current}
          onValueChange={(value) => {
            if (isSupportedLanguage(value)) void i18n.changeLanguage(value);
          }}
        >
          <SelectTrigger
            id={id}
            aria-label={t("language.label")}
            className={cn(
              "w-auto gap-1.5 shadow-none",
              navbar
                ? "h-9 rounded-lg border-transparent bg-transparent px-3 text-sm font-medium text-[#334155] hover:bg-[#F1F5F9] focus-visible:border-[#E2E8F0] focus-visible:outline-accent"
                : "h-8 rounded-full border-border bg-surface px-3 text-xs font-medium text-ink focus-visible:border-accent focus-visible:outline-accent",
            )}
          >
            <SelectValue>
              {navbar ? (
                <>
                  <span className="hidden sm:inline" aria-hidden="true">
                    {LANGUAGE_LABELS[current]}
                  </span>
                  <span className="sm:hidden" aria-hidden="true">
                    {LANGUAGE_SHORT[current]}
                  </span>
                </>
              ) : (
                <>
                  {t("language.label")}: {LANGUAGE_SHORT[current]}
                </>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end" className="min-w-[10rem]">
            <SelectItem value="bg">{LANGUAGE_LABELS.bg}</SelectItem>
            <SelectItem value="en">{LANGUAGE_LABELS.en}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="label mb-1.5 block" htmlFor={id}>
        {t("language.label")}
      </label>
      <Select
        value={current}
        onValueChange={(value) => {
          if (isSupportedLanguage(value)) void i18n.changeLanguage(value);
        }}
      >
        <SelectTrigger id={id} className="w-full" aria-label={t("language.label")}>
          <SelectValue>{LANGUAGE_LABELS[current]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bg">{LANGUAGE_LABELS.bg}</SelectItem>
          <SelectItem value="en">{LANGUAGE_LABELS.en}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
