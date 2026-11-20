import { z } from "zod";

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  PASSWORD_CHANGE_REQUIRED: "PASSWORD_CHANGE_REQUIRED",
  LAST_ADMIN_REQUIRED: "LAST_ADMIN_REQUIRED",
  SELF_MODIFICATION_FORBIDDEN: "SELF_MODIFICATION_FORBIDDEN",
  INTERNAL: "INTERNAL",
} as const;

export const ErrorCodeSchema = z.enum([
  ErrorCode.VALIDATION_FAILED,
  ErrorCode.UNAUTHENTICATED,
  ErrorCode.FORBIDDEN,
  ErrorCode.NOT_FOUND,
  ErrorCode.CONFLICT,
  ErrorCode.TOO_MANY_REQUESTS,
  ErrorCode.ACCOUNT_LOCKED,
  ErrorCode.PASSWORD_CHANGE_REQUIRED,
  ErrorCode.LAST_ADMIN_REQUIRED,
  ErrorCode.SELF_MODIFICATION_FORBIDDEN,
  ErrorCode.INTERNAL,
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
