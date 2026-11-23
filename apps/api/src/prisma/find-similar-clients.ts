export type SimilarClientRow = {
  id: string;
  name: string;
  eik: string | null;
  is_active: boolean;
  score: number;
};

/**
 * Read-only pg_trgm similarity lookup against `clients.name_normalized`.
 * Lives under `src/prisma` so `$queryRaw` stays centralized with actor helpers.
 */
export async function findSimilarClientsByNormalizedName(
  db: {
    $queryRaw: <T = unknown>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<T>;
  },
  normalizedName: string,
  options: { excludeId?: string; minScore?: number; limit?: number },
): Promise<SimilarClientRow[]> {
  const minScore = options.minScore ?? 0.6;
  const limit = options.limit ?? 5;
  const excludeId = options.excludeId ?? null;

  // `name_normalized % $q` uses gin_trgm_ops; similarity() then filters the score.
  return db.$queryRaw<SimilarClientRow[]>`
    SELECT
      c.id,
      c.name,
      c.eik,
      c.is_active,
      similarity(c.name_normalized, ${normalizedName})::float8 AS score
    FROM clients c
    WHERE c.name_normalized % ${normalizedName}
      AND similarity(c.name_normalized, ${normalizedName}) >= ${minScore}
      AND (${excludeId}::uuid IS NULL OR c.id <> ${excludeId}::uuid)
    ORDER BY score DESC, c.name ASC
    LIMIT ${limit}
  `;
}
