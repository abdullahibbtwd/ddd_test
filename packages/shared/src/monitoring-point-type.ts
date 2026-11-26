import { z } from "zod";

export const MonitoringPointType = {
  NEOT: "NEOT",
  POT: "POT",
} as const;

export const MonitoringPointTypeSchema = z.enum([
  MonitoringPointType.NEOT,
  MonitoringPointType.POT,
]);

export type MonitoringPointType = z.infer<typeof MonitoringPointTypeSchema>;
