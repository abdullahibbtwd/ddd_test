import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "./invoice-status";
import {
  canEditVisitChildren,
  groupActiveSubstancesForReport,
  groupRecommendationsForReport,
  reconcileMonitoringPointCount,
} from "./products";

describe("canEditVisitChildren", () => {
  const visit = { id: "v1" };

  it("true when no linked invoice", () => {
    expect(canEditVisitChildren(visit, null)).toBe(true);
    expect(canEditVisitChildren(visit, undefined)).toBe(true);
  });

  it("true when invoice is DRAFT", () => {
    expect(canEditVisitChildren(visit, InvoiceStatus.DRAFT)).toBe(true);
  });

  it("false when invoice is ISSUED", () => {
    expect(canEditVisitChildren(visit, InvoiceStatus.ISSUED)).toBe(false);
  });

  it("false when invoice is CANCELLED_BY_CREDIT_NOTE", () => {
    expect(
      canEditVisitChildren(visit, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE),
    ).toBe(false);
  });
});

describe("reconcileMonitoringPointCount", () => {
  it("creates placeholders when target > current", () => {
    const result = reconcileMonitoringPointCount(
      [
        { id: "a", label: "Точка 1", active: true },
        { id: "b", label: "Точка 2", active: true },
      ],
      4,
    );
    expect(result.toCreate).toEqual([{ label: "Точка 3" }, { label: "Точка 4" }]);
    expect(result.toDeactivate).toEqual([]);
    expect(result.unchanged).toEqual(["a", "b"]);
  });

  it("skips labels that already exist (including inactive)", () => {
    const result = reconcileMonitoringPointCount(
      [
        { id: "a", label: "Точка 1", active: true },
        { id: "x", label: "Точка 2", active: false },
      ],
      3,
    );
    expect(result.toCreate).toEqual([{ label: "Точка 3" }, { label: "Точка 4" }]);
  });

  it("deactivates trailing labels when target < current (ordered by label)", () => {
    const result = reconcileMonitoringPointCount(
      [
        { id: "c", label: "Точка 3", active: true },
        { id: "a", label: "Точка 1", active: true },
        { id: "b", label: "Точка 2", active: true },
      ],
      1,
    );
    expect(result.unchanged).toEqual(["a"]);
    expect(result.toDeactivate).toEqual(["b", "c"]);
    expect(result.toCreate).toEqual([]);
  });

  it("is idempotent when target equals active count", () => {
    const rows = [
      { id: "b", label: "Точка 2", active: true },
      { id: "a", label: "Точка 1", active: true },
      { id: "z", label: "Стара", active: false },
    ];
    const first = reconcileMonitoringPointCount(rows, 2);
    const second = reconcileMonitoringPointCount(rows, 2);
    expect(first).toEqual(second);
    expect(first.toCreate).toEqual([]);
    expect(first.toDeactivate).toEqual([]);
    expect(first.unchanged).toEqual(["a", "b"]);
  });

  it("target 0 deactivates all active", () => {
    const result = reconcileMonitoringPointCount(
      [{ id: "a", label: "Точка 1", active: true }],
      0,
    );
    expect(result.toDeactivate).toEqual(["a"]);
    expect(result.unchanged).toEqual([]);
  });
});

describe("groupActiveSubstancesForReport", () => {
  it("de-dupes and preserves order", () => {
    expect(
      groupActiveSubstancesForReport([
        { name: "A", activeSubstances: ["α", "β"] },
        { name: "B", activeSubstances: ["β", "γ", ""] },
        { name: "C", activeSubstances: [" γ ", "δ"] },
      ]),
    ).toEqual(["α", "β", "γ", "δ"]);
  });

  it("returns empty for no products", () => {
    expect(groupActiveSubstancesForReport([])).toEqual([]);
  });
});

describe("groupRecommendationsForReport", () => {
  it("de-dupes recommendations", () => {
    expect(
      groupRecommendationsForReport([
        { name: "A", activeSubstances: [], recommendations: "Вентилирайте" },
        { name: "B", activeSubstances: [], recommendations: "Вентилирайте" },
        { name: "C", activeSubstances: [], recommendations: "Избягвайте контакт" },
        { name: "D", activeSubstances: [], recommendations: null },
      ]),
    ).toEqual(["Вентилирайте", "Избягвайте контакт"]);
  });
});
