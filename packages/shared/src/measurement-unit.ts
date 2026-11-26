import { z } from "zod";

export const MeasurementUnit = {
  G: "G",
  KG: "KG",
  ML: "ML",
  L: "L",
  PIECE: "PIECE",
} as const;

export const MeasurementUnitSchema = z.enum([
  MeasurementUnit.G,
  MeasurementUnit.KG,
  MeasurementUnit.ML,
  MeasurementUnit.L,
  MeasurementUnit.PIECE,
]);

export type MeasurementUnit = z.infer<typeof MeasurementUnitSchema>;
