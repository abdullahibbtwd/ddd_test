import { createId, type AuditSecurityAction } from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getActorContext } from "./actor-context";

export type ExplicitAuditInput = {
  action: AuditSecurityAction | string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  meta?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Inserts an explicit security/audit event into audit_log using the current
   * actor context for source / label / request id / ip.
   * Never pass passwords, tokens, or hashes in meta.
   */
  async log(input: ExplicitAuditInput): Promise<void> {
    const ctx = getActorContext();
    const actorUserId =
      input.actorUserId !== undefined ? input.actorUserId : (ctx?.actorUserId ?? null);

    await this.prisma.auditLog.create({
      data: {
        id: createId(),
        source: ctx?.source ?? "system",
        actorUserId,
        actorLabel: ctx?.actorLabel ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: Prisma.JsonNull,
        after: Prisma.JsonNull,
        changedFields: [],
        meta:
          input.meta === undefined || input.meta === null
            ? Prisma.JsonNull
            : (input.meta as Prisma.InputJsonValue),
        requestId: ctx?.requestId ?? null,
        ip: ctx?.ip ?? null,
      },
    });
  }
}
