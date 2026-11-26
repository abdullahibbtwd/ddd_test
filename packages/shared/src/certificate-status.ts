import { z } from "zod";

/** Computed display state — never stored in the DB. */
export const CertificateStatus = {
  CURRENT: "CURRENT",
  EXPIRING: "EXPIRING",
  EXPIRED: "EXPIRED",
} as const;

export const CertificateStatusSchema = z.enum([
  CertificateStatus.CURRENT,
  CertificateStatus.EXPIRING,
  CertificateStatus.EXPIRED,
]);

export type CertificateStatus = z.infer<typeof CertificateStatusSchema>;
