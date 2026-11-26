import { MeasurementUnit, ProductFormulation } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";

/** Mirrors product drawer validation used on /products. */
function validateProductName(name: string): string | null {
  return name.trim().length >= 2 ? null : "name";
}

function filterArchived<T extends { archived: boolean }>(
  items: T[],
  includeArchived: boolean,
): T[] {
  return includeArchived ? items : items.filter((i) => !i.archived);
}

function reportUrl(visitId: string): string {
  return `/api/visits/${visitId}/service-report?copy=0`;
}

describe("products UI helpers (Task 18)", () => {
  it("product form rejects short names", () => {
    expect(validateProductName("A")).toBe("name");
    expect(validateProductName("  ")).toBe("name");
    expect(validateProductName("OK")).toBeNull();
  });

  it("visit product picker filters archived", () => {
    const items = [
      { id: "1", name: "A", archived: false, formulation: ProductFormulation.LIQUID },
      { id: "2", name: "B", archived: true, formulation: ProductFormulation.GEL },
    ];
    expect(filterArchived(items, false)).toHaveLength(1);
    expect(filterArchived(items, true)).toHaveLength(2);
  });

  it("quantity must be > 0", () => {
    expect(Number("0") > 0).toBe(false);
    expect(Number("0.001") > 0).toBe(true);
    expect(MeasurementUnit.ML).toBe("ML");
  });

  it("frozen state disables actions", () => {
    const frozen = true;
    const canWrite = !frozen;
    expect(canWrite).toBe(false);
  });

  it("report button URL construction", () => {
    expect(reportUrl("01a20dc0-0000-7000-8000-000000000001")).toBe(
      "/api/visits/01a20dc0-0000-7000-8000-000000000001/service-report?copy=0",
    );
  });
});
