import { describe, expect, it } from "vitest";
import { buildDuplicateUiState } from "../-clients-duplicates";

describe("buildDuplicateUiState", () => {
  it("blocks save on SAME_EIK and keeps up to 3 similar names", () => {
    const state = buildDuplicateUiState([
      {
        id: "1",
        name: "Рамбо ЕООД",
        eik: "831641791",
        isActive: true,
        reason: "SAME_EIK",
        score: 1,
      },
      {
        id: "2",
        name: "Рамбо",
        eik: null,
        isActive: true,
        reason: "SIMILAR_NAME",
        score: 0.9,
      },
      {
        id: "3",
        name: "Рамбо Груп",
        eik: null,
        isActive: true,
        reason: "SIMILAR_NAME",
        score: 0.8,
      },
      {
        id: "4",
        name: "Рамбус",
        eik: null,
        isActive: true,
        reason: "SIMILAR_NAME",
        score: 0.7,
      },
      {
        id: "5",
        name: "Рам",
        eik: null,
        isActive: true,
        reason: "SIMILAR_NAME",
        score: 0.65,
      },
    ]);
    expect(state.saveBlocked).toBe(true);
    expect(state.sameEik?.name).toBe("Рамбо ЕООД");
    expect(state.similarNames).toHaveLength(3);
  });

  it("allows save when only SIMILAR_NAME", () => {
    const state = buildDuplicateUiState([
      {
        id: "2",
        name: "Рамбо",
        eik: null,
        isActive: true,
        reason: "SIMILAR_NAME",
        score: 0.9,
      },
    ]);
    expect(state.saveBlocked).toBe(false);
    expect(state.sameEik).toBeNull();
    expect(state.similarNames).toHaveLength(1);
  });

  it("blocks save on race DUPLICATE_EIK name", () => {
    const state = buildDuplicateUiState([], "Съществуващ ООД");
    expect(state.saveBlocked).toBe(true);
    expect(state.sameEik?.name).toBe("Съществуващ ООД");
  });
});
