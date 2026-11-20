/**
 * Locks all active ADMIN user rows for the duration of the current transaction
 * (`SELECT … FOR UPDATE`). Call inside `PrismaService.transaction()`.
 */
export async function lockActiveAdminRows(tx: {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
}): Promise<{ id: string }[]> {
  return tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users
    WHERE role = 'ADMIN'::"Role" AND is_active = true
    FOR UPDATE
  `;
}
