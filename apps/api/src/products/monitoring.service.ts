import {
  canEditVisitChildren,
  createId,
  defineAbilityFor,
  ErrorCode,
  reconcileMonitoringPointCount,
  Role,
  todayInSofia,
  type MonitoringPointCheckBatchBody,
  type MonitoringPointCheckCreateBody,
  type MonitoringPointCheckItem,
  type MonitoringPointCheckList,
  type MonitoringPointCheckUpdateBody,
  type MonitoringPointCreateBody,
  type MonitoringPointItem,
  type MonitoringPointListQuery,
  type MonitoringPointPage,
  type MonitoringPointReconcileBody,
  type MonitoringPointReconcileResult,
  type MonitoringPointUpdateBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import {
  accessibleSiteWhere,
  accessibleVisitWhere,
} from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type {
  MonitoringPoint,
  MonitoringPointStatus,
  MonitoringPointType,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { mapVisitChildWriteError } from "./sql-errors";

@Injectable()
export class MonitoringService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertManagePoints(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "MonitoringPoint") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage monitoring points");
    }
  }

  private async assertSiteVisible(user: AuthRequestUser, siteId: string): Promise<void> {
    const ability = this.abilityFor(user);
    const site = await this.prisma.site.findFirst({
      where: { AND: [{ id: siteId }, accessibleSiteWhere(ability)] },
      select: { id: true },
    });
    if (!site) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }
  }

  private toPointItem(
    row: MonitoringPoint,
    latestCheck?: MonitoringPointItem["latestCheck"],
  ): MonitoringPointItem {
    return {
      id: row.id,
      siteId: row.siteId,
      label: row.label,
      location: row.location,
      type: row.type,
      active: row.active,
      latestCheck,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listPoints(
    user: AuthRequestUser,
    siteId: string,
    query: MonitoringPointListQuery,
  ): Promise<MonitoringPointPage> {
    const ability = this.abilityFor(user);
    if (
      !ability.can("read", "MonitoringPoint") &&
      !ability.can("manage", "MonitoringPoint") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot read monitoring points");
    }
    await this.assertSiteVisible(user, siteId);

    const where: Prisma.MonitoringPointWhereInput = { siteId };
    if (query.active === "true") where.active = true;
    else if (query.active === "false") where.active = false;

    const [total, rows] = await Promise.all([
      this.prisma.monitoringPoint.count({ where }),
      this.prisma.monitoringPoint.findMany({
        where,
        orderBy: [{ active: "desc" }, { label: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const latestByPoint = new Map<
      string,
      NonNullable<MonitoringPointItem["latestCheck"]>
    >();
    if (query.withLatestCheck && rows.length > 0) {
      const checks = await this.prisma.monitoringPointCheck.findMany({
        where: { pointId: { in: rows.map((r) => r.id) } },
        orderBy: [{ checkedAt: "desc" }, { createdAt: "desc" }],
      });
      for (const check of checks) {
        if (latestByPoint.has(check.pointId)) continue;
        latestByPoint.set(check.pointId, {
          id: check.id,
          visitId: check.visitId,
          checkedAt: dateToIsoDate(check.checkedAt),
          status: check.status,
          notes: check.notes,
        });
      }
    }

    return {
      items: rows.map((row) =>
        this.toPointItem(row, query.withLatestCheck ? (latestByPoint.get(row.id) ?? null) : undefined),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createPoint(
    user: AuthRequestUser,
    siteId: string,
    body: MonitoringPointCreateBody,
  ): Promise<MonitoringPointItem> {
    this.assertManagePoints(user);
    await this.assertSiteVisible(user, siteId);
    try {
      const row = await this.prisma.monitoringPoint.create({
        data: {
          id: createId(),
          siteId,
          label: body.label,
          location: body.location ?? null,
          type: body.type,
          active: true,
          createdById: user.id,
        },
      });
      return this.toPointItem(row);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new AppException(ErrorCode.CONFLICT, "Point label already exists on this site");
      }
      throw error;
    }
  }

  async updatePoint(
    user: AuthRequestUser,
    id: string,
    body: MonitoringPointUpdateBody,
  ): Promise<MonitoringPointItem> {
    this.assertManagePoints(user);
    const existing = await this.prisma.monitoringPoint.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Monitoring point not found");
    }
    await this.assertSiteVisible(user, existing.siteId);

    try {
      const row = await this.prisma.monitoringPoint.update({
        where: { id },
        data: {
          label: body.label,
          location: body.location === undefined ? undefined : body.location,
          type: body.type,
          active: body.active,
        },
      });
      return this.toPointItem(row);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new AppException(ErrorCode.CONFLICT, "Point label already exists on this site");
      }
      throw error;
    }
  }

  /**
   * Deterministic reconcile in a single transaction. Prefer this (and site PATCH
   * which calls it) over writing monitoring_points_count directly — the count
   * trigger keeps the denormalized column in sync.
   */
  async reconcile(
    user: AuthRequestUser,
    siteId: string,
    body: MonitoringPointReconcileBody,
  ): Promise<MonitoringPointReconcileResult> {
    this.assertManagePoints(user);
    await this.assertSiteVisible(user, siteId);

    return this.prisma.transaction(async (tx) => {
      const rows = await tx.monitoringPoint.findMany({
        where: { siteId },
        select: { id: true, label: true, active: true },
      });
      const plan = reconcileMonitoringPointCount(rows, body.targetCount);

      const created: MonitoringPointItem[] = [];
      for (const item of plan.toCreate) {
        const row = await tx.monitoringPoint.create({
          data: {
            id: createId(),
            siteId,
            label: item.label,
            location: null,
            // Default new placeholders to NEOT; office can retarget via PATCH.
            type: "NEOT" as MonitoringPointType,
            active: true,
            createdById: user.id,
          },
        });
        created.push(this.toPointItem(row));
      }

      const deactivated: MonitoringPointItem[] = [];
      for (const id of plan.toDeactivate) {
        const row = await tx.monitoringPoint.update({
          where: { id },
          data: { active: false },
        });
        deactivated.push(this.toPointItem(row));
      }

      const activeCount = await tx.monitoringPoint.count({
        where: { siteId, active: true },
      });

      return {
        created,
        deactivated,
        targetCount: body.targetCount,
        activeCount,
      };
    });
  }

  // --- Point checks ---

  private async loadVisitForChecks(user: AuthRequestUser, visitId: string) {
    const ability = this.abilityFor(user);
    const visit = await this.prisma.visit.findFirst({
      where: { AND: [{ id: visitId }, accessibleVisitWhere(ability)] },
      select: {
        id: true,
        siteId: true,
        createdById: true,
        visitDate: true,
        invoiceLinks: {
          take: 1,
          select: { invoice: { select: { status: true } } },
        },
      },
    });
    if (!visit) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit not found");
    }
    const invoiceStatus = visit.invoiceLinks[0]?.invoice.status ?? null;
    const frozen = !canEditVisitChildren(visit, invoiceStatus);
    return { visit, frozen };
  }

  private assertFieldCheckWrite(
    user: AuthRequestUser,
    createdById: string,
    frozen: boolean,
  ): void {
    if (user.role !== Role.FIELD) return;
    if (createdById !== user.id) {
      throw new AppException(ErrorCode.FORBIDDEN, "FIELD may only edit own visits");
    }
    if (frozen) {
      throw new AppException(
        ErrorCode.POINT_CHECK_FROZEN,
        "Point checks are frozen after the invoice was issued",
      );
    }
  }

  private toCheckItem(
    row: {
      id: string;
      pointId: string;
      visitId: string;
      checkedAt: Date;
      status: MonitoringPointStatus;
      notes: string | null;
      photoFileId: string | null;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
      point: { label: string; type: MonitoringPointType };
    },
    frozen: boolean,
  ): MonitoringPointCheckItem {
    return {
      id: row.id,
      pointId: row.pointId,
      pointLabel: row.point.label,
      pointType: row.point.type,
      visitId: row.visitId,
      checkedAt: dateToIsoDate(row.checkedAt),
      status: row.status,
      notes: row.notes,
      photoFileId: row.photoFileId,
      frozen,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private checkInclude = {
    point: { select: { label: true, type: true } },
  } satisfies Prisma.MonitoringPointCheckInclude;

  async listChecks(
    user: AuthRequestUser,
    visitId: string,
  ): Promise<MonitoringPointCheckList> {
    const ability = this.abilityFor(user);
    if (
      !ability.can("manage", "MonitoringPointCheck") &&
      !ability.can("manage", "all") &&
      !ability.can("read", "Visit")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot read point checks");
    }
    const { frozen } = await this.loadVisitForChecks(user, visitId);
    const rows = await this.prisma.monitoringPointCheck.findMany({
      where: { visitId },
      include: this.checkInclude,
      orderBy: { point: { label: "asc" } },
    });
    return {
      items: rows.map((row) => this.toCheckItem(row, frozen)),
      frozen,
    };
  }

  async createCheck(
    user: AuthRequestUser,
    visitId: string,
    body: MonitoringPointCheckCreateBody,
  ): Promise<MonitoringPointCheckItem> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "MonitoringPointCheck") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage point checks");
    }

    const { visit, frozen } = await this.loadVisitForChecks(user, visitId);
    this.assertFieldCheckWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.POINT_CHECK_FROZEN,
        "Point checks are frozen after the invoice was issued",
      );
    }

    const checkedAt = body.checkedAt
      ? isoDateToDate(body.checkedAt)
      : isoDateToDate(dateToIsoDate(visit.visitDate));

    try {
      const row = await this.prisma.monitoringPointCheck.create({
        data: {
          id: createId(),
          pointId: body.pointId,
          visitId,
          checkedAt,
          status: body.status,
          notes: body.notes ?? null,
          photoFileId: null,
          createdById: user.id,
        },
        include: this.checkInclude,
      });
      return this.toCheckItem(row, false);
    } catch (error) {
      mapVisitChildWriteError(error, "check");
    }
  }

  async batchUpsertChecks(
    user: AuthRequestUser,
    visitId: string,
    body: MonitoringPointCheckBatchBody,
  ): Promise<MonitoringPointCheckList> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "MonitoringPointCheck") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage point checks");
    }

    const { visit, frozen } = await this.loadVisitForChecks(user, visitId);
    this.assertFieldCheckWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.POINT_CHECK_FROZEN,
        "Point checks are frozen after the invoice was issued",
      );
    }

    const checkedAt = isoDateToDate(dateToIsoDate(visit.visitDate));

    try {
      await this.prisma.transaction(async (tx) => {
        for (const check of body.checks) {
          const existing = await tx.monitoringPointCheck.findUnique({
            where: {
              pointId_visitId: { pointId: check.pointId, visitId },
            },
          });
          if (existing) {
            await tx.monitoringPointCheck.update({
              where: { id: existing.id },
              data: {
                status: check.status,
                notes: check.notes === undefined ? existing.notes : check.notes,
                checkedAt,
              },
            });
          } else {
            await tx.monitoringPointCheck.create({
              data: {
                id: createId(),
                pointId: check.pointId,
                visitId,
                checkedAt,
                status: check.status,
                notes: check.notes ?? null,
                photoFileId: null,
                createdById: user.id,
              },
            });
          }
        }
      });
    } catch (error) {
      mapVisitChildWriteError(error, "check");
    }

    return this.listChecks(user, visitId);
  }

  async updateCheck(
    user: AuthRequestUser,
    id: string,
    body: MonitoringPointCheckUpdateBody,
  ): Promise<MonitoringPointCheckItem> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "MonitoringPointCheck") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage point checks");
    }

    const existing = await this.prisma.monitoringPointCheck.findUnique({
      where: { id },
      include: this.checkInclude,
    });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Point check not found");
    }

    const { visit, frozen } = await this.loadVisitForChecks(user, existing.visitId);
    this.assertFieldCheckWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.POINT_CHECK_FROZEN,
        "Point checks are frozen after the invoice was issued",
      );
    }

    try {
      const row = await this.prisma.monitoringPointCheck.update({
        where: { id },
        data: {
          status: body.status,
          notes: body.notes === undefined ? undefined : body.notes,
          checkedAt: body.checkedAt ? isoDateToDate(body.checkedAt) : undefined,
        },
        include: this.checkInclude,
      });
      return this.toCheckItem(row, false);
    } catch (error) {
      mapVisitChildWriteError(error, "check");
    }
  }

  async removeCheck(user: AuthRequestUser, id: string): Promise<void> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "MonitoringPointCheck") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage point checks");
    }

    const existing = await this.prisma.monitoringPointCheck.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Point check not found");
    }

    const { visit, frozen } = await this.loadVisitForChecks(user, existing.visitId);
    this.assertFieldCheckWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.POINT_CHECK_FROZEN,
        "Point checks are frozen after the invoice was issued",
      );
    }

    try {
      await this.prisma.monitoringPointCheck.delete({ where: { id } });
    } catch (error) {
      mapVisitChildWriteError(error, "check");
    }
  }

  /** Default checked_at helper for DST-safe Sofia calendar dates. */
  todayCheckedAt(): string {
    return todayInSofia(new Date());
  }
}
