import type { ClientDuplicateCandidate, DuplicateReason } from "@ddcrm/shared";

export type DuplicateUiState = {
  sameEik: ClientDuplicateCandidate | null;
  similarNames: ClientDuplicateCandidate[];
  /** Save must be blocked when SAME_EIK is present (or a race DUPLICATE_EIK). */
  saveBlocked: boolean;
};

/** Pure projection of duplicates endpoint results (and optional race) for the form UI. */
export function buildDuplicateUiState(
  candidates: readonly ClientDuplicateCandidate[],
  raceDuplicateName: string | null = null,
): DuplicateUiState {
  const sameEik =
    candidates.find((c) => c.reason === ("SAME_EIK" satisfies DuplicateReason)) ?? null;
  const similarNames = candidates
    .filter((c) => c.reason === ("SIMILAR_NAME" satisfies DuplicateReason))
    .slice(0, 3);

  if (raceDuplicateName && !sameEik) {
    return {
      sameEik: {
        id: "race",
        name: raceDuplicateName,
        eik: null,
        isActive: true,
        reason: "SAME_EIK",
        score: 1,
      },
      similarNames,
      saveBlocked: true,
    };
  }

  return {
    sameEik,
    similarNames,
    saveBlocked: sameEik !== null,
  };
}
