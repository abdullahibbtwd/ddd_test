export type SimilarSiteRow = {
  id: string;
  name: string;
  address: string;
  score: number;
};

/**
 * Same-client address similarity via pg_trgm.
 * Lives under `src/prisma` so `$queryRaw` stays centralized.
 */
export async function findSimilarSitesByAddress(
  db: {
    $queryRaw: <T = unknown>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<T>;
  },
  clientId: string,
  address: string,
  options: { excludeId?: string; minScore?: number; limit?: number },
): Promise<SimilarSiteRow[]> {
  const minScore = options.minScore ?? 0.8;
  const limit = options.limit ?? 5;
  const excludeId = options.excludeId ?? null;

  return db.$queryRaw<SimilarSiteRow[]>`
    SELECT
      s.id,
      s.name,
      s.address,
      similarity(s.address, ${address})::float8 AS score
    FROM sites s
    WHERE s.client_id = ${clientId}::uuid
      AND s.address % ${address}
      AND similarity(s.address, ${address}) >= ${minScore}
      AND (${excludeId}::uuid IS NULL OR s.id <> ${excludeId}::uuid)
    ORDER BY score DESC, s.name ASC
    LIMIT ${limit}
  `;
}
