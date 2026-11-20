/**
 * Pure deletion logic used by the scheduled job and unit-tested in isolation.
 * Deletes sessions whose expires_at is older than `olderThanDays` days.
 */
export async function deleteExpiredAuthSessions(
  prisma: {
    authSession: {
      deleteMany: (args: {
        where: { expiresAt: { lt: Date } };
      }) => Promise<{ count: number }>;
    };
  },
  olderThanDays = 7,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return result.count;
}
