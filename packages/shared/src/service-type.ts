import { z } from "zod";

export const ServiceType = {
  INSECT_CONTROL: "INSECT_CONTROL",
  RODENT_CONTROL: "RODENT_CONTROL",
  DISINFECTION: "DISINFECTION",
  OTHER: "OTHER",
} as const;

export const ServiceTypeSchema = z.enum([
  ServiceType.INSECT_CONTROL,
  ServiceType.RODENT_CONTROL,
  ServiceType.DISINFECTION,
  ServiceType.OTHER,
]);

export type ServiceType = z.infer<typeof ServiceTypeSchema>;
