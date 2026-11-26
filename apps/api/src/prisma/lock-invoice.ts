/**
 * Invoice row / counter locks (`SELECT … FOR UPDATE`).
 * Call inside `PrismaService.transaction()`.
 */

type QueryRawClient = {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

export async function lockInvoiceForUpdate(
  tx: QueryRawClient,
  invoiceId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status::text AS status
    FROM invoices
    WHERE id = ${invoiceId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function lockInvoiceCounterForUpdate(
  tx: QueryRawClient,
): Promise<{ next_value: number }> {
  const rows = await tx.$queryRaw<{ next_value: number }[]>`
    SELECT next_value
    FROM invoice_counters
    WHERE id = 'default'
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("invoice_counters row 'default' is missing");
  }
  return row;
}

export async function readInvoiceCounterValue(
  tx: QueryRawClient,
): Promise<number> {
  const rows = await tx.$queryRaw<{ next_value: number }[]>`
    SELECT next_value
    FROM invoice_counters
    WHERE id = 'default'
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("invoice_counters row 'default' is missing");
  }
  return row.next_value;
}
