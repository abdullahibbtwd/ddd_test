import { z } from "zod";
import { PageQuerySchema } from "./page-query";

export const AreaListQuerySchema = PageQuerySchema.extend({
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
});

export type AreaListQuery = z.infer<typeof AreaListQuerySchema>;

export const AreaAssignedUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.string(),
  isActive: z.boolean(),
});

export type AreaAssignedUser = z.infer<typeof AreaAssignedUserSchema>;

export const AreaItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  /** Present only for ADMIN list/detail responses. */
  userCount: z.number().int().nonnegative().optional(),
  users: z.array(AreaAssignedUserSchema).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AreaItem = z.infer<typeof AreaItemSchema>;

export const AreaPageSchema = z.object({
  items: z.array(AreaItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type AreaPage = z.infer<typeof AreaPageSchema>;

/** Trim and collapse repeated whitespace in area names. */
export function normalizeAreaName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const CreateAreaBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .transform((value) => normalizeAreaName(value))
    .refine((value) => value.length > 0, { message: "Name is required" }),
});

export type CreateAreaBody = z.infer<typeof CreateAreaBodySchema>;

export const UpdateAreaBodySchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .transform((value) => normalizeAreaName(value))
      .refine((value) => value.length > 0, { message: "Name is required" })
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "At least one field is required",
  });

export type UpdateAreaBody = z.infer<typeof UpdateAreaBodySchema>;
