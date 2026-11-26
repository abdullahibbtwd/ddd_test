import { ReportKind } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import {
  buildReportExportUrl,
  reportKindFromSlug,
  reportKindSlug,
} from "@/lib/report-kind";

describe("report-kind helpers", () => {
  it("round-trips slug ↔ kind", () => {
    expect(reportKindFromSlug("revenue")).toBe(ReportKind.REVENUE);
    expect(reportKindFromSlug("service-coverage")).toBe(
      ReportKind.SERVICE_COVERAGE,
    );
    expect(reportKindSlug(ReportKind.OUTSTANDING)).toBe("outstanding");
    expect(reportKindFromSlug("nope")).toBeNull();
  });

  it("builds export URL with filters", () => {
    const url = buildReportExportUrl(ReportKind.CASH, "excel", {
      from: "2026-01-01",
      to: "2026-01-31",
      employeeId: undefined,
    });
    expect(url).toContain("/api/reports/CASH/export?");
    expect(url).toContain("format=excel");
    expect(url).toContain("from=2026-01-01");
    expect(url).toContain("to=2026-01-31");
    expect(url).not.toContain("employeeId");
  });
});
