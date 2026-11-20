import {
  ChangePasswordBodySchema,
  LoginBodySchema,
  LoginResponseSchema,
  MeResponseSchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class LoginBodyDto extends createZodDto(LoginBodySchema) {}
export class ChangePasswordBodyDto extends createZodDto(ChangePasswordBodySchema) {}
export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}
export class MeResponseDto extends createZodDto(MeResponseSchema) {}

export const LogoutResponseSchema = z.object({ ok: z.literal(true) });
export class LogoutResponseDto extends createZodDto(LogoutResponseSchema) {}

export const RefreshResponseSchema = z.object({ ok: z.literal(true) });
export class RefreshResponseDto extends createZodDto(RefreshResponseSchema) {}
