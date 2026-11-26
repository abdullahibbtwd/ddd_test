import { describe, expect, it } from "vitest";
import { AgingBucket } from "./payments";
import {
  RevenueGrouping,
  agingBucketFromDueDate,
  commonFilterSchema,
  groupingKey,
  monthRange,
  quantityByUnit,
  type RevenueGroupingInput,
} from "./reports";

describe("monthRange", () => {
  it("lists months across a year boundary", () => {
    expect(monthRange("2025-11-15", "2026-02-01")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("lists a single month when from and to share the month", () => {
    expect(monthRange("2026-03-01", "2026-03-31")).toEqual(["2026-03"]);
  });

  it("returns empty when from month is after to month", () => {
    expect(monthRange("2026-05-01", "2026-04-15")).toEqual([]);
  });
});

describe("agingBucketFromDueDate", () => {
  it("matches agingBuckets thresholds", () => {
    expect(agingBucketFromDueDate("2026-11-24", "2026-11-24")).toBe(
      AgingBucket["0_30"],
    );
    expect(agingBucketFromDueDate("2026-10-25", "2026-11-24")).toBe(
      AgingBucket["0_30"],
    );
    expect(agingBucketFromDueDate("2026-10-24", "2026-11-24")).toBe(
      AgingBucket["31_60"],
    );
    expect(agingBucketFromDueDate("2026-09-25", "2026-11-24")).toBe(
      AgingBucket["31_60"],
    );
    expect(agingBucketFromDueDate("2026-09-24", "2026-11-24")).toBe(
      AgingBucket["61_90"],
    );
    expect(agingBucketFromDueDate("2026-08-26", "2026-11-24")).toBe(
      AgingBucket["61_90"],
    );
    expect(agingBucketFromDueDate("2026-08-25", "2026-11-24")).toBe(
      AgingBucket["90_plus"],
    );
  });
});

describe("groupingKey", () => {
  const row: RevenueGroupingInput = {
    clientId: "c1",
    siteId: "s1",
    areaId: "a1",
    employeeId: "e1",
    serviceKey: "insect",
    periodMonth: "2026-11",
  };

  it("is deterministic per mode", () => {
    expect(groupingKey(row, RevenueGrouping.CLIENT)).toBe("client:c1");
    expect(groupingKey(row, RevenueGrouping.SITE)).toBe("site:s1");
    expect(groupingKey(row, RevenueGrouping.AREA)).toBe("area:a1");
    expect(groupingKey(row, RevenueGrouping.EMPLOYEE)).toBe("employee:e1");
    expect(groupingKey(row, RevenueGrouping.SERVICE)).toBe("service:insect");
    expect(groupingKey(row, RevenueGrouping.PERIOD)).toBe("period:2026-11");
  });

  it("uses empty segment for null dimensions", () => {
    const empty: RevenueGroupingInput = {
      clientId: null,
      siteId: null,
      areaId: null,
      employeeId: null,
      serviceKey: null,
      periodMonth: null,
    };
    expect(groupingKey(empty, RevenueGrouping.CLIENT)).toBe("client:");
    expect(groupingKey(empty, RevenueGrouping.PERIOD)).toBe("period:");
  });
});

describe("quantityByUnit", () => {
  it("sums per unit without mixing units", () => {
    expect(
      quantityByUnit([
        { quantity: "1.5", unit: "KG" },
        { quantity: "0.25", unit: "KG" },
        { quantity: "100", unit: "ML" },
        { quantity: 2, unit: "ML" },
        { quantity: "3", unit: "PIECE" },
      ]),
    ).toEqual({
      KG: "1.750",
      ML: "102.000",
      PIECE: "3.000",
    });
  });
});

describe("commonFilterSchema", () => {
  it("accepts from <= to", () => {
    expect(
      commonFilterSchema.safeParse({ from: "2026-01-01", to: "2026-01-31" })
        .success,
    ).toBe(true);
  });

  it("fails when from > to", () => {
    const result = commonFilterSchema.safeParse({
      from: "2026-02-01",
      to: "2026-01-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("from"))).toBe(
        true,
      );
    }
  });
});
