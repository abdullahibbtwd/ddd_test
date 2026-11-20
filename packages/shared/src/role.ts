import { z } from "zod";

export const Role = {
  ADMIN: "ADMIN",
  OFFICE: "OFFICE",
  FIELD: "FIELD",
} as const;

export const RoleSchema = z.enum([Role.ADMIN, Role.OFFICE, Role.FIELD]);

export type Role = z.infer<typeof RoleSchema>;
