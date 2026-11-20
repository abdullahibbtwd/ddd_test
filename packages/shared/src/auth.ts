import { z } from "zod";
import { RoleSchema } from "./role";

/** Password rules: 10–128 chars, must not equal the email. No composition rules. */
export function passwordSchema(email?: string) {
  let schema = z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be at most 128 characters");

  if (email !== undefined) {
    const normalizedEmail = email.trim().toLowerCase();
    schema = schema.refine((password) => password.trim().toLowerCase() !== normalizedEmail, {
      message: "Password must not equal the email",
    });
  }

  return schema;
}

export const LoginBodySchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

export const ChangePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  })
  .superRefine((value, ctx) => {
    // Email equality is checked in the service (needs the authenticated user).
    if (value.newPassword.length < 10 || value.newPassword.length > 128) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Password must be between 10 and 128 characters",
      });
    }
  });

export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;

export const AuthUserAreaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type AuthUserArea = z.infer<typeof AuthUserAreaSchema>;

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: RoleSchema,
  mustChangePassword: z.boolean(),
  areas: z.array(AuthUserAreaSchema),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginResponseSchema = z.object({
  user: AuthUserSchema,
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MeResponseSchema = LoginResponseSchema;
export type MeResponse = LoginResponse;
