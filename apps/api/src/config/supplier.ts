/**
 * Supplier (issuer) details printed on invoice PDFs.
 *
 * TODO(Phase 13 — settings): replace this hardcoded object with values from
 * a settings UI / DB row. The client must provide the real company details and
 * the accountant must confirm wording and layout (Q-accountant).
 */
export const SUPPLIER = {
  name: "ДД Пест Контрол ЕООД",
  eik: "000000000",
  vatNumber: "BG000000000",
  address: "гр. София, ул. Примерна 1",
  iban: "BG00XXXX00000000000000",
  bank: "Примерна банка АД",
  phone: "+359 2 000 0000",
  email: "office@example.bg",
} as const;

export type SupplierConfig = typeof SUPPLIER;
