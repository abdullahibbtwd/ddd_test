import {
  createId,
  defineAbilityFor,
  ErrorCode,
  FoodResultStatus,
  type FoodRecordCreateBody,
  type FoodRecordItem,
  type FoodRecordListQuery,
  type FoodRecordPage,
  type FoodRecordUpdateBody,
  type FoodScheduleCreateBody,
  type FoodScheduleDueQuery,
  type FoodScheduleItem,
  type FoodScheduleListQuery,
  type FoodSchedulePage,
  type FoodScheduleUpdateBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type {
  FoodSampleRecord,
  FoodSamplingSchedule,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type ScheduleRow = FoodSamplingSchedule & {
  site?: { name: string } | null;
};

type RecordRow = FoodSampleRecord & {
  site?: { name: string } | null;
};

@Injectable()
export class FoodSamplingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertScheduleManage(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (
      !ability.can("manage", "FoodSchedule") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private assertRecordManage(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (
      !ability.can("manage", "FoodRecord") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private toScheduleItem(row: ScheduleRow): FoodScheduleItem {
    return {
      id: row.id,
      siteId: row.siteId,
      siteName: row.site?.name,
      serviceType: row.serviceType,
      cadenceMonths: row.cadenceMonths,
      nextDueAt: dateToIsoDate(row.nextDueAt),
      active: row.active,
      notes: row.notes,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toRecordItem(row: RecordRow): Promise<FoodRecordItem> {
    let resultUrl: string | null = null;
    if (row.resultFileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: row.resultFileId },
      });
      if (file) {
        resultUrl = await this.storage.presignGet(file.storageKey, 3600);
      }
    }
    return {
      id: row.id,
      scheduleId: row.scheduleId,
      siteId: row.siteId,
      siteName: row.site?.name,
      collectedAt: dateToIsoDate(row.collectedAt),
      sampleDescription: row.sampleDescription,
      labName: row.labName,
      resultReceivedAt: row.resultReceivedAt
        ? dateToIsoDate(row.resultReceivedAt)
        : null,
      resultStatus: row.resultStatus,
      resultSummary: row.resultSummary,
      resultFileId: row.resultFileId,
      resultUrl,
      notes: row.notes,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findSchedules(
    user: AuthRequestUser,
    query: FoodScheduleListQuery,
  ): Promise<FoodSchedulePage> {
    this.assertScheduleManage(user);
    const where: Prisma.FoodSamplingScheduleWhereInput = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.active !== undefined) where.active = query.active;

    const [total, rows] = await Promise.all([
      this.prisma.foodSamplingSchedule.count({ where }),
      this.prisma.foodSamplingSchedule.findMany({
        where,
        include: { site: { select: { name: true } } },
        orderBy: [{ nextDueAt: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => this.toScheduleItem(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createSchedule(
    user: AuthRequestUser,
    body: FoodScheduleCreateBody,
  ): Promise<FoodScheduleItem> {
    this.assertScheduleManage(user);
    const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }
    try {
      const row = await this.prisma.foodSamplingSchedule.create({
        data: {
          id: createId(),
          siteId: body.siteId,
          serviceType: body.serviceType,
          cadenceMonths: body.cadenceMonths,
          nextDueAt: isoDateToDate(body.nextDueAt),
          active: true,
          notes: body.notes ?? null,
          createdById: user.id,
        },
        include: { site: { select: { name: true } } },
      });
      return this.toScheduleItem(row);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new AppException(
          ErrorCode.CONFLICT,
          "Active schedule already exists for this site and service type",
        );
      }
      throw error;
    }
  }

  async updateSchedule(
    user: AuthRequestUser,
    id: string,
    body: FoodScheduleUpdateBody,
  ): Promise<FoodScheduleItem> {
    this.assertScheduleManage(user);
    const existing = await this.prisma.foodSamplingSchedule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.FOOD_SCHEDULE_NOT_FOUND,
        "Food schedule not found",
      );
    }
    try {
      const row = await this.prisma.foodSamplingSchedule.update({
        where: { id },
        data: {
          ...(body.cadenceMonths !== undefined
            ? { cadenceMonths: body.cadenceMonths }
            : {}),
          ...(body.nextDueAt !== undefined
            ? { nextDueAt: isoDateToDate(body.nextDueAt) }
            : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
        include: { site: { select: { name: true } } },
      });
      return this.toScheduleItem(row);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new AppException(
          ErrorCode.CONFLICT,
          "Active schedule already exists for this site and service type",
        );
      }
      throw error;
    }
  }

  async findDue(
    user: AuthRequestUser,
    query: FoodScheduleDueQuery,
  ): Promise<FoodSchedulePage> {
    this.assertScheduleManage(user);
    const where: Prisma.FoodSamplingScheduleWhereInput = {
      active: true,
      nextDueAt: { lte: isoDateToDate(query.asOf) },
    };
    const [total, rows] = await Promise.all([
      this.prisma.foodSamplingSchedule.count({ where }),
      this.prisma.foodSamplingSchedule.findMany({
        where,
        include: { site: { select: { name: true } } },
        orderBy: [{ nextDueAt: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.toScheduleItem(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findRecords(
    user: AuthRequestUser,
    query: FoodRecordListQuery,
  ): Promise<FoodRecordPage> {
    this.assertRecordManage(user);
    const where: Prisma.FoodSampleRecordWhereInput = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.scheduleId) where.scheduleId = query.scheduleId;
    if (query.resultStatus) where.resultStatus = query.resultStatus;

    const [total, rows] = await Promise.all([
      this.prisma.foodSampleRecord.count({ where }),
      this.prisma.foodSampleRecord.findMany({
        where,
        include: { site: { select: { name: true } } },
        orderBy: [{ collectedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const items = await Promise.all(rows.map((r) => this.toRecordItem(r)));
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Creates a record. When schedule_id is set, the DB trigger advances
   * next_due_at — the API does not double-update.
   */
  async createRecord(
    user: AuthRequestUser,
    body: FoodRecordCreateBody,
  ): Promise<FoodRecordItem> {
    this.assertRecordManage(user);
    const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }
    if (body.scheduleId) {
      const schedule = await this.prisma.foodSamplingSchedule.findUnique({
        where: { id: body.scheduleId },
      });
      if (!schedule) {
        throw new AppException(
          ErrorCode.FOOD_SCHEDULE_NOT_FOUND,
          "Food schedule not found",
        );
      }
    }

    const status = body.resultStatus ?? FoodResultStatus.PENDING;
    const resultReceivedAt =
      status === FoodResultStatus.PENDING
        ? null
        : (body.resultReceivedAt ?? null);
    if (status !== FoodResultStatus.PENDING && resultReceivedAt == null) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        "resultReceivedAt is required when result is set",
      );
    }

    const row = await this.prisma.foodSampleRecord.create({
      data: {
        id: createId(),
        scheduleId: body.scheduleId ?? null,
        siteId: body.siteId,
        collectedAt: isoDateToDate(body.collectedAt),
        sampleDescription: body.sampleDescription,
        labName: body.labName ?? null,
        resultReceivedAt: resultReceivedAt
          ? isoDateToDate(resultReceivedAt)
          : null,
        resultStatus: status,
        resultSummary: body.resultSummary ?? null,
        resultFileId: body.resultFileId ?? null,
        notes: body.notes ?? null,
        createdById: user.id,
      },
      include: { site: { select: { name: true } } },
    });
    return this.toRecordItem(row);
  }

  /**
   * While PENDING any field may change; once CONFORMING/NON_CONFORMING the
   * row is frozen (legal record).
   */
  async updateRecord(
    user: AuthRequestUser,
    id: string,
    body: FoodRecordUpdateBody,
  ): Promise<FoodRecordItem> {
    this.assertRecordManage(user);
    const existing = await this.prisma.foodSampleRecord.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.FOOD_RECORD_NOT_FOUND,
        "Food record not found",
      );
    }
    if (existing.resultStatus !== FoodResultStatus.PENDING) {
      throw new AppException(
        ErrorCode.FOOD_RECORD_FROZEN,
        "Food record is frozen after result is set",
      );
    }

    const nextStatus = body.resultStatus ?? existing.resultStatus;
    let resultReceivedAt = existing.resultReceivedAt;
    if (body.resultReceivedAt !== undefined) {
      resultReceivedAt =
        body.resultReceivedAt == null
          ? null
          : isoDateToDate(body.resultReceivedAt);
    }
    if (
      nextStatus !== FoodResultStatus.PENDING &&
      resultReceivedAt == null
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        "resultReceivedAt is required when result is set",
      );
    }

    const row = await this.prisma.foodSampleRecord.update({
      where: { id },
      data: {
        ...(body.collectedAt !== undefined
          ? { collectedAt: isoDateToDate(body.collectedAt) }
          : {}),
        ...(body.sampleDescription !== undefined
          ? { sampleDescription: body.sampleDescription }
          : {}),
        ...(body.labName !== undefined ? { labName: body.labName } : {}),
        ...(body.resultStatus !== undefined
          ? { resultStatus: body.resultStatus }
          : {}),
        ...(body.resultReceivedAt !== undefined
          ? {
              resultReceivedAt:
                body.resultReceivedAt == null
                  ? null
                  : isoDateToDate(body.resultReceivedAt),
            }
          : {}),
        ...(body.resultSummary !== undefined
          ? { resultSummary: body.resultSummary }
          : {}),
        ...(body.resultFileId !== undefined
          ? { resultFileId: body.resultFileId }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: { site: { select: { name: true } } },
    });
    return this.toRecordItem(row);
  }
}
