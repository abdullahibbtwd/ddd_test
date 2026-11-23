import { z } from "zod";

export const SiteStatus = {
  ACTIVE: "ACTIVE",
  TERMINATED: "TERMINATED",
} as const;

export const SiteStatusSchema = z.enum([SiteStatus.ACTIVE, SiteStatus.TERMINATED]);

export type SiteStatus = z.infer<typeof SiteStatusSchema>;
