import { z } from "zod";

export const SubscriptionFrequency = {
  MONTHLY: "MONTHLY",
  EVERY_2_MONTHS: "EVERY_2_MONTHS",
  QUARTERLY: "QUARTERLY",
  ON_DEMAND: "ON_DEMAND",
} as const;

export const SubscriptionFrequencySchema = z.enum([
  SubscriptionFrequency.MONTHLY,
  SubscriptionFrequency.EVERY_2_MONTHS,
  SubscriptionFrequency.QUARTERLY,
  SubscriptionFrequency.ON_DEMAND,
]);

export type SubscriptionFrequency = z.infer<typeof SubscriptionFrequencySchema>;
