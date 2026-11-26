import {
  ClientKind,
  createId,
  defineAbilityFor,
  ErrorCode,
  normalizeClientName,
  normalizePhone,
  PhoneValidationError,
  Role,
  SiteStatus,
  todayInSofia,
  validateEik,
  type CreateSiteBody,
  type SiteDuplicateCandidate,
  type SiteDuplicatesQuery,
  type SiteDuplicatesResponse,
  type SiteItem,
  type SiteListItem,
  type SiteListQuery,
  type SiteMapQuery,
  type SiteMapResponse,
  type SiteLastVisitSummary,
  type SitePage,
  type SubscriptionCurrentSummary,
  type UpdateSiteBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { accessibleClientWhere, accessibleSiteWhere } from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type { Prisma, SiteStatus as PrismaSiteStatus } from "../generated/prisma/client";
import type { Decimal } from "../generated/prisma/internal/prismaNamespace";
import { findSimilarSitesByAddress } from "../prisma/find-similar-sites";
import type { AppTransactionClient } from "../prisma/run-transaction";
import { PrismaService } from "../prisma/prisma.service";
import { MonitoringService } from "../products/monitoring.service";

const MAP_CAP = 500;

type SiteWithRelations = {
  id: string;
  name: string;
  address: string;
  status: PrismaSiteStatus;
  latitude: Decimal | null;
  longitude: Decimal | null;
  contactPerson: string | null;
  contactPhone: string | null;
  floorAreaM2: Decimal | null;
  monitoringPointsCount: number;
  notes: string | null;
  terminatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  area: { id: string; name: string };
  siteType: { id: string; name: string };
  client: { id: string; name: string; eik: string | null; phone: string | null };
};

@Injectable()
export class SitesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MonitoringService) private readonly monitoring: MonitoringService,
  ) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private toNumber(value: Decimal | null): number | null {
    if (value == null) return null;
    return Number(value);
  }

  private toListItem(row: SiteWithRelations): SiteListItem {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      status: row.status,
      area: { id: row.area.id, name: row.area.name },
      type: { id: row.siteType.id, name: row.siteType.name },
      client: { id: row.client.id, name: row.client.name },
      monitoringPointsCount: row.monitoringPointsCount,
      latitude: this.toNumber(row.latitude),
      longitude: this.toNumber(row.longitude),
    };
  }

  private toItem(
    row: SiteWithRelations,
    currentSubscription: SubscriptionCurrentSummary | null = null,
    lastVisitSummary: SiteLastVisitSummary | null = null,
  ): SiteItem {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      status: row.status,
      area: { id: row.area.id, name: row.area.name },
      type: { id: row.siteType.id, name: row.siteType.name },
      client: {
        id: row.client.id,
        name: row.client.name,
        eik: row.client.eik,
        phone: row.client.phone,
      },
      latitude: this.toNumber(row.latitude),
      longitude: this.toNumber(row.longitude),
      contactPerson: row.contactPerson,
      contactPhone: row.contactPhone,
      floorAreaM2: this.toNumber(row.floorAreaM2),
      monitoringPointsCount: row.monitoringPointsCount,
      notes: row.notes,
      terminatedAt: row.terminatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      currentSubscription,
      lastVisitAt: lastVisitSummary?.visitDate ?? null,
      lastVisitSummary,
    };
  }

  private async loadLastVisitSummary(siteId: string): Promise<SiteLastVisitSummary | null> {
    const row = await this.prisma.visit.findFirst({
      where: { siteId },
      orderBy: [{ visitDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        visitDate: true,
        treatmentType: true,
        chargedAmount: true,
        rateIncludesVat: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      visitDate: dateToIsoDate(row.visitDate),
      treatmentType: row.treatmentType,
      chargedAmount: Number(row.chargedAmount),
      rateIncludesVat: row.rateIncludesVat,
    };
  }

  private async loadCurrentSubscription(
    siteId: string,
    asOf: Date = new Date(),
  ): Promise<SubscriptionCurrentSummary | null> {
    const today = todayInSofia(asOf);
    const todayDate = isoDateToDate(today);
    const row = await this.prisma.subscription.findFirst({
      where: {
        siteId,
        startDate: { lte: todayDate },
        OR: [{ endDate: null }, { endDate: { gte: todayDate } }],
      },
      orderBy: { startDate: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      frequency: row.frequency,
      services: row.services,
      rate: Number(row.rate),
      rateIncludesVat: row.rateIncludesVat,
      startDate: dateToIsoDate(row.startDate),
      endDate: row.endDate ? dateToIsoDate(row.endDate) : null,
    };
  }

  /**
   * Ends the subscription active on Sofia today in the given transaction.
   * Open-ended / future end → end_date = today; start after today → end_date = start_date.
   */
  private async endCurrentSubscriptionInTx(
    tx: AppTransactionClient,
    siteId: string,
    today: string,
  ): Promise<void> {
    const todayDate = isoDateToDate(today);
    const current = await tx.subscription.findFirst({
      where: {
        siteId,
        startDate: { lte: todayDate },
        OR: [{ endDate: null }, { endDate: { gte: todayDate } }],
      },
      orderBy: { startDate: "desc" },
    });
    if (!current) return;

    const startDate = dateToIsoDate(current.startDate);
    const newEnd = startDate > today ? startDate : today;
    if (current.endDate && dateToIsoDate(current.endDate) === newEnd) return;
    await tx.subscription.update({
      where: { id: current.id },
      data: { endDate: isoDateToDate(newEnd) },
    });
  }

  private includeRelations = {
    area: { select: { id: true, name: true } },
    siteType: { select: { id: true, name: true } },
    client: { select: { id: true, name: true, eik: true, phone: true } },
  } as const;

  private normalizeOptionalPhone(phone: string | null | undefined): string | null | undefined {
    if (phone === undefined) return undefined;
    if (phone === null || phone.trim() === "") return null;
    try {
      return normalizePhone(phone);
    } catch (error) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        error instanceof PhoneValidationError ? error.message : "Invalid phone number",
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  private orderBy(query: SiteListQuery): Prisma.SiteOrderByWithRelationInput {
    const sort = query.sort ?? "name";
    switch (sort) {
      case "-name":
        return { name: "desc" };
      case "created_at":
      case "createdAt":
        return { createdAt: "asc" };
      case "-created_at":
      case "-createdAt":
        return { createdAt: "desc" };
      case "name":
      default:
        return { name: "asc" };
    }
  }

  private statusFilter(status: SiteListQuery["status"] | SiteMapQuery["status"]): Prisma.SiteWhereInput {
    if (status === "ALL") return {};
    return { status: status as PrismaSiteStatus };
  }

  private searchWhere(search: string): Prisma.SiteWhereInput {
    return {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { client: { name: { contains: search, mode: "insensitive" } } },
        { client: { eik: { startsWith: search } } },
      ],
    };
  }

  private baseFilters(
    user: AuthRequestUser,
    filters: {
      search?: string;
      areaId?: string;
      siteTypeId?: string;
      clientId?: string;
      hasSubscription?: boolean;
      status: SiteListQuery["status"] | SiteMapQuery["status"];
    },
  ): Prisma.SiteWhereInput {
    const ability = this.abilityFor(user);
    const scope = accessibleSiteWhere(ability);
    const today = isoDateToDate(todayInSofia(new Date()));
    const subscriptionFilter =
      filters.hasSubscription === undefined
        ? {}
        : filters.hasSubscription
          ? {
              subscriptions: {
                some: {
                  startDate: { lte: today },
                  OR: [{ endDate: null }, { endDate: { gte: today } }],
                },
              },
            }
          : {
              subscriptions: {
                none: {
                  startDate: { lte: today },
                  OR: [{ endDate: null }, { endDate: { gte: today } }],
                },
              },
            };
    return {
      AND: [
        scope,
        this.statusFilter(filters.status),
        filters.areaId ? { areaId: filters.areaId } : {},
        filters.siteTypeId ? { siteTypeId: filters.siteTypeId } : {},
        filters.clientId ? { clientId: filters.clientId } : {},
        filters.search ? this.searchWhere(filters.search) : {},
        subscriptionFilter,
      ],
    };
  }

  async findPage(user: AuthRequestUser, query: SiteListQuery): Promise<SitePage> {
    const where = this.baseFilters(user, query);
    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.site.count({ where }),
      this.prisma.site.findMany({
        where,
        include: this.includeRelations,
        orderBy: this.orderBy(query),
        skip,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toListItem(row as SiteWithRelations)),
      total,
      page,
      pageSize,
    };
  }

  async findMap(user: AuthRequestUser, query: SiteMapQuery): Promise<SiteMapResponse> {
    const where: Prisma.SiteWhereInput = {
      AND: [
        this.baseFilters(user, query),
        { latitude: { not: null } },
        { longitude: { not: null } },
      ],
    };

    const total = await this.prisma.site.count({ where });
    const rows = await this.prisma.site.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: MAP_CAP,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        clientName: row.client.name,
      })),
      total,
      truncated: total > MAP_CAP,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<SiteItem> {
    const ability = this.abilityFor(user);
    const scope = accessibleSiteWhere(ability);
    const row = await this.prisma.site.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.includeRelations,
    });
    if (!row) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }
    const [currentSubscription, lastVisitSummary] = await Promise.all([
      this.loadCurrentSubscription(id),
      this.loadLastVisitSummary(id),
    ]);
    return this.toItem(row as SiteWithRelations, currentSubscription, lastVisitSummary);
  }

  async findDuplicates(
    user: AuthRequestUser,
    query: SiteDuplicatesQuery,
  ): Promise<SiteDuplicatesResponse> {
    // Caller must be able to read the client (or manage).
    const ability = this.abilityFor(user);
    const clientScope = accessibleClientWhere(ability);
    const client = await this.prisma.client.findFirst({
      where: { AND: [{ id: query.clientId }, clientScope] },
      select: { id: true },
    });
    if (!client) {
      throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
    }

    const similar = await findSimilarSitesByAddress(this.prisma, query.clientId, query.address, {
      excludeId: query.excludeId,
      minScore: 0.8,
      limit: 5,
    });

    // Also scope results to accessible sites.
    const siteScope = accessibleSiteWhere(ability);
    const scopedIds = new Set(
      (
        await this.prisma.site.findMany({
          where: {
            AND: [{ id: { in: similar.map((s) => s.id) } }, siteScope],
          },
          select: { id: true },
        })
      ).map((s) => s.id),
    );

    const items: SiteDuplicateCandidate[] = similar
      .filter((row) => scopedIds.has(row.id))
      .map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        score: row.score,
      }));

    return { items };
  }

  private async assertActiveArea(areaId: string): Promise<void> {
    const area = await this.prisma.area.findUnique({ where: { id: areaId } });
    if (!area || !area.isActive) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "Area is inactive or missing", [
        { path: "areaId", message: "Area must be active" },
      ]);
    }
  }

  private async assertActiveSiteType(siteTypeId: string): Promise<void> {
    const siteType = await this.prisma.siteType.findUnique({ where: { id: siteTypeId } });
    if (!siteType || !siteType.isActive) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "Site type is inactive or missing", [
        { path: "siteTypeId", message: "Site type must be active" },
      ]);
    }
  }

  private assertCanCreateInArea(user: AuthRequestUser, areaId: string): void {
    if (user.role === Role.ADMIN || user.role === Role.OFFICE) return;
    if (!user.areaIds.includes(areaId)) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot create site in this area");
    }
  }

  private async resolveReadableClient(
    user: AuthRequestUser,
    clientId: string,
  ): Promise<{ id: string; isActive: boolean; name: string }> {
    const ability = this.abilityFor(user);
    const scope = accessibleClientWhere(ability);
    const client = await this.prisma.client.findFirst({
      where: { AND: [{ id: clientId }, scope] },
      select: { id: true, isActive: true, name: true },
    });
    if (!client) {
      throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
    }
    return client;
  }

  private async throwDuplicateEik(
    user: AuthRequestUser,
    eik: string,
  ): Promise<never> {
    const existing = await this.prisma.client.findFirst({
      where: { eik },
      select: { id: true, name: true, isActive: true },
    });
    if (!existing) {
      throw new AppException(ErrorCode.DUPLICATE_EIK, "Client with this EIK already exists");
    }

    const ability = this.abilityFor(user);
    const scope = accessibleClientWhere(ability);
    const readable = await this.prisma.client.findFirst({
      where: { AND: [{ id: existing.id }, scope] },
      select: { id: true },
    });

    if (readable) {
      throw new AppException(ErrorCode.DUPLICATE_EIK, "Client with this EIK already exists", {
        existingClientId: existing.id,
        existingName: existing.name,
        existingIsActive: existing.isActive,
      });
    }
    throw new AppException(ErrorCode.DUPLICATE_EIK, "Client with this EIK already exists");
  }

  async create(user: AuthRequestUser, body: CreateSiteBody): Promise<SiteItem> {
    this.assertCanCreateInArea(user, body.areaId);
    await this.assertActiveArea(body.areaId);
    await this.assertActiveSiteType(body.siteTypeId);

    const contactPhone = this.normalizeOptionalPhone(body.contactPhone ?? null) ?? null;
    const latitude = body.latitude ?? null;
    const longitude = body.longitude ?? null;

    if (body.clientId) {
      const client = await this.resolveReadableClient(user, body.clientId);
      if (!client.isActive) {
        throw new AppException(ErrorCode.CLIENT_ARCHIVED, "Client is archived");
      }

      const siteId = createId();
      const targetCount = body.monitoringPointsCount ?? 0;
      const row = await this.prisma.site.create({
        data: {
          id: siteId,
          clientId: body.clientId,
          areaId: body.areaId,
          siteTypeId: body.siteTypeId,
          name: body.name,
          address: body.address,
          latitude,
          longitude,
          contactPerson: body.contactPerson ?? null,
          contactPhone,
          floorAreaM2: body.floorAreaM2 ?? null,
          // Count is owned by the monitoring_points sync trigger after reconcile.
          monitoringPointsCount: 0,
          notes: body.notes ?? null,
          status: SiteStatus.ACTIVE,
          terminatedAt: null,
        },
        include: this.includeRelations,
      });
      if (targetCount > 0 && this.abilityFor(user).can("manage", "MonitoringPoint")) {
        await this.monitoring.reconcile(user, siteId, { targetCount });
        const refreshed = await this.prisma.site.findUniqueOrThrow({
          where: { id: siteId },
          include: this.includeRelations,
        });
        return this.toItem(refreshed as SiteWithRelations);
      }
      return this.toItem(row as SiteWithRelations);
    }

    // Quick-add: newClient + site in one transaction.
    const ability = this.abilityFor(user);
    if (!ability.can("quickCreate", "Client")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot quick-create client");
    }

    const newClient = body.newClient!;
    if (newClient.kind === ClientKind.COMPANY) {
      if (!newClient.eik || !validateEik(newClient.eik)) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, "Invalid EIK", {
          code: ErrorCode.INVALID_EIK,
          path: "newClient.eik",
        });
      }
    } else if (newClient.eik && !validateEik(newClient.eik)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "Invalid EIK", {
        code: ErrorCode.INVALID_EIK,
        path: "newClient.eik",
      });
    }

    const clientPhone = this.normalizeOptionalPhone(newClient.phone ?? null) ?? null;
    const clientId = createId();
    const siteId = createId();

    try {
      const row = await this.prisma.transaction(async (tx) => {
        await tx.client.create({
          data: {
            id: clientId,
            kind: newClient.kind,
            name: newClient.name,
            nameNormalized: normalizeClientName(newClient.name),
            eik: newClient.eik ?? null,
            phone: clientPhone,
            email: newClient.email ?? null,
            isActive: true,
          },
        });

        return tx.site.create({
          data: {
            id: siteId,
            clientId,
            areaId: body.areaId,
            siteTypeId: body.siteTypeId,
            name: body.name,
            address: body.address,
            latitude,
            longitude,
            contactPerson: body.contactPerson ?? null,
            contactPhone,
            floorAreaM2: body.floorAreaM2 ?? null,
            monitoringPointsCount: 0,
            notes: body.notes ?? null,
            status: SiteStatus.ACTIVE,
            terminatedAt: null,
          },
          include: this.includeRelations,
        });
      });
      const targetCount = body.monitoringPointsCount ?? 0;
      if (targetCount > 0 && this.abilityFor(user).can("manage", "MonitoringPoint")) {
        await this.monitoring.reconcile(user, siteId, { targetCount });
        const refreshed = await this.prisma.site.findUniqueOrThrow({
          where: { id: siteId },
          include: this.includeRelations,
        });
        return this.toItem(refreshed as SiteWithRelations);
      }
      return this.toItem(row as SiteWithRelations);
    } catch (error) {
      if (this.isUniqueViolation(error) && newClient.eik) {
        await this.throwDuplicateEik(user, newClient.eik);
      }
      throw error;
    }
  }

  async update(user: AuthRequestUser, id: string, body: UpdateSiteBody): Promise<SiteItem> {
    const ability = this.abilityFor(user);
    if (!ability.can("update", "Site") && !ability.can("manage", "Site") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot update sites");
    }

    const existing = await this.prisma.site.findUnique({
      where: { id },
      include: { client: { select: { id: true, isActive: true } } },
    });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }

    if (body.areaId !== undefined) {
      await this.assertActiveArea(body.areaId);
    }
    if (body.siteTypeId !== undefined) {
      // Inactive type rejected for updates that change type; keeping existing inactive type is OK.
      await this.assertActiveSiteType(body.siteTypeId);
    }

    const data: Prisma.SiteUpdateInput = {};
    if (body.areaId !== undefined) data.area = { connect: { id: body.areaId } };
    if (body.siteTypeId !== undefined) data.siteType = { connect: { id: body.siteTypeId } };
    if (body.name !== undefined) data.name = body.name;
    if (body.address !== undefined) data.address = body.address;
    if (body.latitude !== undefined) data.latitude = body.latitude;
    if (body.longitude !== undefined) data.longitude = body.longitude;
    if (body.contactPerson !== undefined) data.contactPerson = body.contactPerson;
    if (body.contactPhone !== undefined) {
      data.contactPhone = this.normalizeOptionalPhone(body.contactPhone) ?? null;
    }
    if (body.floorAreaM2 !== undefined) data.floorAreaM2 = body.floorAreaM2;
    // monitoringPointsCount is applied via reconcile (UI uses PATCH site OR
    // POST …/monitoring-points/reconcile). Do not write the denormalized column
    // directly — the monitoring_points trigger owns it.
    if (body.notes !== undefined) data.notes = body.notes;

    if (body.status !== undefined) {
      if (body.status === SiteStatus.TERMINATED) {
        data.status = SiteStatus.TERMINATED;
        data.terminatedAt = existing.terminatedAt ?? new Date();
      } else {
        // Reactivating — does NOT revive any subscription.
        if (!existing.client.isActive) {
          throw new AppException(ErrorCode.CLIENT_ARCHIVED, "Client is archived");
        }
        data.status = SiteStatus.ACTIVE;
        data.terminatedAt = null;
      }
    }

    const terminating =
      body.status === SiteStatus.TERMINATED && existing.status !== SiteStatus.TERMINATED;

    await this.prisma.transaction(async (tx) => {
      await tx.site.update({
        where: { id },
        data,
        include: this.includeRelations,
      });
      if (terminating) {
        await this.endCurrentSubscriptionInTx(tx, id, todayInSofia(new Date()));
      }
    });

    if (body.monitoringPointsCount !== undefined) {
      await this.monitoring.reconcile(user, id, {
        targetCount: body.monitoringPointsCount,
      });
    }

    const refreshed = await this.prisma.site.findUniqueOrThrow({
      where: { id },
      include: this.includeRelations,
    });

    const [currentSubscription, lastVisitSummary] = await Promise.all([
      this.loadCurrentSubscription(id),
      this.loadLastVisitSummary(id),
    ]);
    return this.toItem(refreshed as SiteWithRelations, currentSubscription, lastVisitSummary);
  }
}
