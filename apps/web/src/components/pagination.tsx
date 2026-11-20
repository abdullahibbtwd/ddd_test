import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label={t("pagination.label")}
      className={cn("mt-4 flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="num text-xs text-ink-muted">{t("pagination.range", { from, to, total })}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-muted">{t("pagination.page", { page, pages })}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
          {t("pagination.previous")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("pagination.next")}
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
