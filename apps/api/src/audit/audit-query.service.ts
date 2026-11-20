import type { AuditLogPage, AuditLogQuery } from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPage(query: AuditLogQuery): Promise<AuditLogPage> {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.action) where.action = query.action;
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }

    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    const actorIds = [
      ...new Set(
        rows.map((r) => r.actorUserId).filter((id): id is string => id !== null),
      ),
    ];
    const actors =
      actorIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true },
          });
    const nameById = new Map(actors.map((a) => [a.id, a.name]));

    return {
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        source: row.source,
        actorUserId: row.actorUserId,
        actorLabel: row.actorLabel,
        actorName: row.actorUserId ? (nameById.get(row.actorUserId) ?? null) : null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        changedFields: row.changedFields,
        meta: row.meta,
        requestId: row.requestId,
        ip: row.ip,
      })),
      total,
      page,
      pageSize,
    };
  }
}
