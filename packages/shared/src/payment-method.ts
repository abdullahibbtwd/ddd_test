import { z } from "zod";

/** Preferred / recorded payment method — reused by clients and later payments. */
export const PaymentMethod = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  CARD: "CARD",
  OTHER: "OTHER",
} as const;

export const PaymentMethodSchema = z.enum([
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD,
  PaymentMethod.OTHER,
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
