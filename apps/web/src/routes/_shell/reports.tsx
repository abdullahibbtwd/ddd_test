import { ReportKind } from "@ddcrm/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_shell/reports")({
  component: ReportsLandingPage,
});

const KINDS = [
  ReportKind.REVENUE,
  ReportKind.SERVICE_COVERAGE,
  ReportKind.OUTSTANDING,
  ReportKind.CASH,
  ReportKind.EXPIRATIONS,
  ReportKind.PRODUCTS,
] as const;

function ReportsLandingPage() {
  const { t } = useTranslation("reports");

  return (
    <div data-testid="reports-landing">
      <PageHeader title={t("landing.title")} description={t("landing.description")} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map((kind) => (
          <li key={kind}>
            <Link
              to="/reports/$kind"
              params={{ kind: kind.toLowerCase().replace(/_/g, "-") }}
              className="block rounded-md border border-edge px-4 py-3 transition-colors hover:bg-surface-muted"
              data-testid={`report-card-${kind}`}
            >
              <span className="type-section-title block">
                {t(`kinds.${kind}.title`)}
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                {t(`kinds.${kind}.description`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
