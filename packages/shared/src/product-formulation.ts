import { z } from "zod";

export const ProductFormulation = {
  LIQUID: "LIQUID",
  POWDER: "POWDER",
  GEL: "GEL",
  BAIT: "BAIT",
  TRAP: "TRAP",
  AEROSOL: "AEROSOL",
  OTHER: "OTHER",
} as const;

export const ProductFormulationSchema = z.enum([
  ProductFormulation.LIQUID,
  ProductFormulation.POWDER,
  ProductFormulation.GEL,
  ProductFormulation.BAIT,
  ProductFormulation.TRAP,
  ProductFormulation.AEROSOL,
  ProductFormulation.OTHER,
]);

export type ProductFormulation = z.infer<typeof ProductFormulationSchema>;
