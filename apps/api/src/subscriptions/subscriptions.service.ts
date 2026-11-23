import {
  createId,
  defineAbilityFor,
  ErrorCode,
  SiteStatus,
  todayInSofia,
  type CreateSubscriptionBody,
  type SubscriptionItem,
  type SubscriptionListQuery,
  type SubscriptionPage,
  type UpdateSubscriptionBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { accessibleSubscriptionWhere } from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type {
  Prisma,
  ServiceType as PrismaServiceType,
  SubscriptionFrequency as PrismaFrequency,
} from "../generated/prisma/client";
import type { Decimal } from "../generated/prisma/internal/prismaNamespace";
import { PrismaService } from "../prisma/prisma.service";

type SubscriptionRow = {
  id: string;
  siteId: string;
  services: PrismaServiceType[];
  frequency: PrismaFrequency;
  rate: Decimal;
  rateIncludesVat: boolean;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  site: { id: string; name: string };
};

/** Inclusive date-range overlap on 'YYYY-MM-DD' (null end = open). */
function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aHi = aEnd ?? "9999-12-31";
  const bHi = bEnd ?? "9999-12-31";
  return aStart <= bHi && bStart <= aHi;
}

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private toItem(row: SubscriptionRow): SubscriptionItem {
    return {
      id: row.id,
      siteId: row.siteId,
      site: { id: row.site.id, name: row.site.name },
      services: row.services,
      frequency: row.frequency,
      rate: Number(row.rate),
      rateIncludesVat: row.rateIncludesVat,
      startDate: dateToIsoDate(row.startDate),
      endDate: row.endDate ? dateToIsoDate(row.endDate) : null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private includeSite = { site: { select: { id: true, name: true } } } as const;

  /** Detect Postgres exclusion violation (SQLSTATE 23P01) under Prisma adapters. */
  isExclusionViolation(error: unknown): boolean {
    const walk = (value: unknown, depth = 0): boolean => {
      if (depth > 6 || value == null || typeof value !== "object") return false;
      const obj = value as Record<string, unknown>;
      if (obj.code === "23P01") return true;
      if (typeof obj.message === "string" && /exclusion constraint|23P01/i.test(obj.message)) {
        return true;
      }
      for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
        if (key in obj && walk(obj[key], depth + 1)) return true;
      }
      return false;
    };
    return walk(error);
  }

  async findConflictingSubscriptionId(
    siteId: string,
    startDate: string,
    endDate: string | null,
    excludeId?: string,
  ): Promise<string | null> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        siteId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startDate: true, endDate: true },
    });
    for (const row of rows) {
      const rowStart = dateToIsoDate(row.startDate);
      const rowEnd = row.endDate ? dateToIsoDate(row.endDate) : null;
      if (rangesOverlap(rowStart, rowEnd, startDate, endDate)) {
        return row.id;
      }
    }
    return null;
  }

  private async throwOverlap(
    siteId: string,
    startDate: string,
    endDate: string | null,
    excludeId?: string,
  ): Promise<never> {
    const conflictingSubscriptionId =
      (await this.findConflictingSubscriptionId(siteId, startDate, endDate, excludeId)) ??
      "00000000-0000-0000-0000-000000000000";
    throw new AppException(ErrorCode.SUBSCRIPTION_OVERLAP, "Subscription dates overlap", {
      conflictingSubscriptionId,
    });
  }

  async findPage(
    user: AuthRequestUser,
    query: SubscriptionListQuery,
  ): Promise<SubscriptionPage> {
    const ability = this.abilityFor(user);
    const scope = accessibleSubscriptionWhere(ability);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SubscriptionWhereInput = { AND: [scope] };
    if (query.siteId) {
      (where.AND as Prisma.SubscriptionWhereInput[]).push({ siteId: query.siteId });
    }
    if (query.current === true) {
      const today = todayInSofia(new Date());
      const todayDate = isoDateToDate(today);
      (where.AND as Prisma.SubscriptionWhereInput[]).push({
        startDate: { lte: todayDate },
        OR: [{ endDate: null }, { endDate: { gte: todayDate } }],
      });
    }

    const [total, rows] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: this.includeSite,
        orderBy: { startDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row as SubscriptionRow)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<SubscriptionItem> {
    const ability = this.abilityFor(user);
    const scope = accessibleSubscriptionWhere(ability);
    const row = await this.prisma.subscription.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.includeSite,
    });
    if (!row) {
      throw new AppException(ErrorCode.NOT_FOUND, "Subscription not found");
    }
    return this.toItem(row as SubscriptionRow);
  }

  async create(
    _user: AuthRequestUser,
    body: CreateSubscriptionBody,
  ): Promise<SubscriptionItem> {
    const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }
    if (site.status === SiteStatus.TERMINATED) {
      throw new AppException(ErrorCode.SITE_TERMINATED, "Site is terminated");
    }

    const endDate = body.endDate ?? null;
    try {
      const row = await this.prisma.subscription.create({
        data: {
          id: createId(),
          siteId: body.siteId,
          services: body.services,
          frequency: body.frequency,
          rate: body.rate,
          rateIncludesVat: body.rateIncludesVat,
          startDate: isoDateToDate(body.startDate),
          endDate: endDate ? isoDateToDate(endDate) : null,
          notes: body.notes ?? null,
        },
        include: this.includeSite,
      });
      return this.toItem(row as SubscriptionRow);
    } catch (error) {
      if (this.isExclusionViolation(error)) {
        await this.throwOverlap(body.siteId, body.startDate, endDate);
      }
      throw error;
    }
  }

  async update(
    _user: AuthRequestUser,
    id: string,
    body: UpdateSubscriptionBody,
  ): Promise<SubscriptionItem> {
    const existing = await this.prisma.subscription.findUnique({
      where: { id },
      include: this.includeSite,
    });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Subscription not found");
    }

    const startDate = body.startDate ?? dateToIsoDate(existing.startDate);
    const endDate =
      body.endDate !== undefined
        ? body.endDate
        : existing.endDate
          ? dateToIsoDate(existing.endDate)
          : null;

    if (endDate !== null && endDate < startDate) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "endDate must be on or after startDate", [
        { path: ["endDate"], message: "endDate must be on or after startDate" },
      ]);
    }

    const data: Prisma.SubscriptionUpdateInput = {};
    if (body.services !== undefined) data.services = body.services;
    if (body.frequency !== undefined) data.frequency = body.frequency;
    if (body.rate !== undefined) data.rate = body.rate;
    if (body.rateIncludesVat !== undefined) data.rateIncludesVat = body.rateIncludesVat;
    if (body.startDate !== undefined) data.startDate = isoDateToDate(body.startDate);
    if (body.endDate !== undefined) {
      data.endDate = body.endDate ? isoDateToDate(body.endDate) : null;
    }
    if (body.notes !== undefined) data.notes = body.notes;

    try {
      const row = await this.prisma.subscription.update({
        where: { id },
        data,
        include: this.includeSite,
      });
      return this.toItem(row as SubscriptionRow);
    } catch (error) {
      if (this.isExclusionViolation(error)) {
        await this.throwOverlap(existing.siteId, startDate, endDate, id);
      }
      throw error;
    }
  }
}
