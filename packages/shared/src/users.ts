import { z } from "zod";
import { PageQuerySchema } from "./page-query";
import { RoleSchema } from "./role";
import { AuthUserAreaSchema } from "./auth";

export const UserListQuerySchema = PageQuerySchema.extend({
  role: RoleSchema.optional(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
  areaId: z.uuid().optional(),
});

export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const UserItemSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  phone: z.string().nullable(),
  role: RoleSchema,
  isActive: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  mustChangePassword: z.boolean(),
  areas: z.array(AuthUserAreaSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserItem = z.infer<typeof UserItemSchema>;

export const UserPageSchema = z.object({
  items: z.array(UserItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type UserPage = z.infer<typeof UserPageSchema>;

export const CreateUserBodySchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).optional().nullable(),
  role: RoleSchema,
  areaIds: z.array(z.uuid()).optional(),
});

export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;

export const CreateUserResponseSchema = UserItemSchema.extend({
  temporaryPassword: z.string().min(1),
});

export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;

export const UpdateUserBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    role: RoleSchema.optional(),
    isActive: z.boolean().optional(),
    areaIds: z.array(z.uuid()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

export const ResetPasswordResponseSchema = z.object({
  temporaryPassword: z.string().min(1),
});

export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
