import { z } from "zod";
import { PageQuerySchema } from "./page-query";

export const AuditSourceSchema = z.enum(["api", "worker", "cli", "system"]);
export type AuditSource = z.infer<typeof AuditSourceSchema>;

/** Explicit security / auth events written by AuditService (not row triggers). */
export const AuditSecurityAction = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  REFRESH_REUSE_DETECTED: "REFRESH_REUSE_DETECTED",
  PASSWORD_RESET_BY_ADMIN: "PASSWORD_RESET_BY_ADMIN",
  /** GDPR: every read of client_employees / health_certificates. */
  READ_PII: "READ_PII",
  /** GDPR: anonymization of a client employee. */
  ERASED: "ERASED",
  /** GDPR: JSON export of a client employee. */
  EXPORT: "EXPORT",
} as const;

export type AuditSecurityAction =
  (typeof AuditSecurityAction)[keyof typeof AuditSecurityAction];

/** Row-level actions written by the generic DB trigger. */
export const AuditRowAction = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
} as const;

export const AuditLogQuerySchema = PageQuerySchema.extend({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  // ISO-8601 strings (not z.coerce.date) so OpenAPI / nestjs-zod can emit JSON Schema.
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const AuditLogItemSchema = z.object({
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
  source: AuditSourceSchema,
  actorUserId: z.string().uuid().nullable(),
  actorLabel: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  changedFields: z.array(z.string()),
  meta: z.unknown().nullable(),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
});

export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

export const AuditLogPageSchema = z.object({
  items: z.array(AuditLogItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type AuditLogPage = z.infer<typeof AuditLogPageSchema>;
