import { ReportKind, type ReportKind as ReportKindT } from "@ddcrm/shared";

const SLUG_TO_KIND: Record<string, ReportKindT> = {
  revenue: ReportKind.REVENUE,
  "service-coverage": ReportKind.SERVICE_COVERAGE,
  outstanding: ReportKind.OUTSTANDING,
  cash: ReportKind.CASH,
  expirations: ReportKind.EXPIRATIONS,
  products: ReportKind.PRODUCTS,
};

export function reportKindFromSlug(slug: string): ReportKindT | null {
  return SLUG_TO_KIND[slug.toLowerCase()] ?? null;
}

export function reportKindSlug(kind: ReportKindT): string {
  return kind.toLowerCase().replace(/_/g, "-");
}

export function buildReportExportUrl(
  kind: ReportKindT,
  format: "excel" | "pdf",
  filters: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("format", format);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return `/api/reports/${kind}/export?${params.toString()}`;
}
