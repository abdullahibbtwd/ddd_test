import { z } from "zod";

export const AgreementStatus = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  TERMINATED: "TERMINATED",
  RENEWED: "RENEWED",
} as const;

export const AgreementStatusSchema = z.enum([
  AgreementStatus.ACTIVE,
  AgreementStatus.EXPIRED,
  AgreementStatus.TERMINATED,
  AgreementStatus.RENEWED,
]);

export type AgreementStatus = z.infer<typeof AgreementStatusSchema>;
