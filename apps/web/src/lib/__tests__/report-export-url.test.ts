import { ReportKind } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import {
  buildReportExportUrl,
  reportKindFromSlug,
  reportKindSlug,
} from "@/lib/report-kind";

describe("report filter / export URL construction", () => {
  it("maps all six slugs", () => {
    expect(reportKindFromSlug("revenue")).toBe(ReportKind.REVENUE);
    expect(reportKindFromSlug("service-coverage")).toBe(
      ReportKind.SERVICE_COVERAGE,
    );
    expect(reportKindFromSlug("outstanding")).toBe(ReportKind.OUTSTANDING);
    expect(reportKindFromSlug("cash")).toBe(ReportKind.CASH);
    expect(reportKindFromSlug("expirations")).toBe(ReportKind.EXPIRATIONS);
    expect(reportKindFromSlug("products")).toBe(ReportKind.PRODUCTS);
    expect(reportKindFromSlug("nope")).toBeNull();
  });

  it("builds export URL with filters", () => {
    const url = buildReportExportUrl(ReportKind.OUTSTANDING, "pdf", {
      from: "2026-01-01",
      to: "2026-01-31",
      clientId: "c1",
    });
    expect(url).toBe(
      "/api/reports/OUTSTANDING/export?format=pdf&from=2026-01-01&to=2026-01-31&clientId=c1",
    );
  });

  it("slug round-trips", () => {
    expect(reportKindSlug(ReportKind.SERVICE_COVERAGE)).toBe("service-coverage");
  });
});
