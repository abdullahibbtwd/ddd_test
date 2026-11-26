import { z } from "zod";

export const MonitoringPointStatus = {
  OK: "OK",
  ACTIVITY: "ACTIVITY",
  DAMAGED: "DAMAGED",
  MISSING: "MISSING",
  OTHER: "OTHER",
} as const;

export const MonitoringPointStatusSchema = z.enum([
  MonitoringPointStatus.OK,
  MonitoringPointStatus.ACTIVITY,
  MonitoringPointStatus.DAMAGED,
  MonitoringPointStatus.MISSING,
  MonitoringPointStatus.OTHER,
]);

export type MonitoringPointStatus = z.infer<typeof MonitoringPointStatusSchema>;
