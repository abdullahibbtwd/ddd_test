import { AuditSecurityAction, ErrorCode } from "@ddcrm/shared";
import { AppException } from "../common/errors/app.exception";
import type { AuditService } from "../audit/audit.service";

/**
 * Writes a READ_PII audit event. If the audit write fails, the read MUST fail
 * (READ_PII_AUDIT_FAILED) — never proceed silently.
 *
 * Batching: one event per request with `meta.entityIds` listing every row read.
 */
export async function auditReadPii(
  audit: AuditService,
  input: {
    table: "client_employees" | "health_certificates";
    entityIds: string[];
    actorUserId: string;
  },
): Promise<void> {
  if (input.entityIds.length === 0) return;
  try {
    await audit.log({
      action: AuditSecurityAction.READ_PII,
      entityType: input.table,
      entityId: input.entityIds.length === 1 ? input.entityIds[0] : null,
      actorUserId: input.actorUserId,
      meta: {
        entityIds: input.entityIds,
        count: input.entityIds.length,
      },
    });
  } catch (error) {
    throw new AppException(
      ErrorCode.READ_PII_AUDIT_FAILED,
      "Failed to write READ_PII audit event",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}
