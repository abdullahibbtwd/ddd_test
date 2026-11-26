import { z } from "zod";

export const FoodResultStatus = {
  PENDING: "PENDING",
  CONFORMING: "CONFORMING",
  NON_CONFORMING: "NON_CONFORMING",
} as const;

export const FoodResultStatusSchema = z.enum([
  FoodResultStatus.PENDING,
  FoodResultStatus.CONFORMING,
  FoodResultStatus.NON_CONFORMING,
]);

export type FoodResultStatus = z.infer<typeof FoodResultStatusSchema>;
