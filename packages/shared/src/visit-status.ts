import { z } from "zod";

export const VisitStatus = {
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
} as const;

export const VisitStatusSchema = z.enum([
  VisitStatus.ACTIVE,
  VisitStatus.CANCELLED,
]);

export type VisitStatus = z.infer<typeof VisitStatusSchema>;
