import {
  addCalendarDays,
  addCalendarMonths,
  AgreementStatus,
  agreementStatus,
  createId,
  defineAbilityFor,
  ErrorCode,
  expiresWithin,
  todayInSofia,
  type AgreementCreateBody,
  type AgreementExpiringQuery,
  type AgreementItem,
  type AgreementListQuery,
  type AgreementPage,
  type AgreementRenewBody,
  type AgreementUpdateBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type { Agreement, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type AgreementRow = Agreement & {
  client?: { name: string } | null;
  site?: { name: string } | null;
};

@Injectable()
export class AgreementsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertManage(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "Agreement") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private toItem(row: AgreementRow, asOf: string): AgreementItem {
    const expiresAt = dateToIsoDate(row.expiresAt);
    const storedStatus = row.status as AgreementStatus;
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client?.name,
      siteId: row.siteId,
      siteName: row.site?.name,
      serviceType: row.serviceType,
      signedAt: dateToIsoDate(row.signedAt),
      expiresAt,
      contractValue: row.contractValue.toFixed(2),
      status: agreementStatus({ expiresAt, storedStatus, asOf }),
      storedStatus,
      previousAgreementId: row.previousAgreementId,
      notes: row.notes,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findPage(
    user: AuthRequestUser,
    query: AgreementListQuery,
  ): Promise<AgreementPage> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const where: Prisma.AgreementWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.siteId) where.siteId = query.siteId;
    if (query.status) {
      // Filter by stored status for TERMINATED/RENEWED; calendar for others handled post-query
      if (
        query.status === AgreementStatus.TERMINATED ||
        query.status === AgreementStatus.RENEWED
      ) {
        where.status = query.status;
      } else if (query.status === AgreementStatus.ACTIVE) {
        where.status = AgreementStatus.ACTIVE;
        where.expiresAt = { gte: isoDateToDate(asOf) };
      } else if (query.status === AgreementStatus.EXPIRED) {
        where.OR = [
          { status: AgreementStatus.EXPIRED },
          {
            status: AgreementStatus.ACTIVE,
            expiresAt: { lt: isoDateToDate(asOf) },
          },
        ];
      }
    }
    if (query.expiringWithin !== undefined) {
      const limit = addCalendarDays(asOf, query.expiringWithin);
      where.expiresAt = {
        gte: isoDateToDate(asOf),
        lte: isoDateToDate(limit),
      };
      where.status = AgreementStatus.ACTIVE;
    }

    const [total, rows] = await Promise.all([
      this.prisma.agreement.count({ where }),
      this.prisma.agreement.findMany({
        where,
        include: {
          client: { select: { name: true } },
          site: { select: { name: true } },
        },
        orderBy: [{ expiresAt: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => this.toItem(r, asOf)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<AgreementItem> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const row = await this.prisma.agreement.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
      },
    });
    if (!row) {
      throw new AppException(ErrorCode.AGREEMENT_NOT_FOUND, "Agreement not found");
    }
    return this.toItem(row, asOf);
  }

  async create(
    user: AuthRequestUser,
    body: AgreementCreateBody,
  ): Promise<AgreementItem> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site || site.clientId !== body.clientId) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found for client");
    }
    const row = await this.prisma.agreement.create({
      data: {
        id: createId(),
        clientId: body.clientId,
        siteId: body.siteId,
        serviceType: body.serviceType,
        signedAt: isoDateToDate(body.signedAt),
        expiresAt: isoDateToDate(body.expiresAt),
        contractValue: body.contractValue,
        status: AgreementStatus.ACTIVE,
        notes: body.notes ?? null,
        createdById: user.id,
      },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
      },
    });
    return this.toItem(row, asOf);
  }

  async update(
    user: AuthRequestUser,
    id: string,
    body: AgreementUpdateBody,
  ): Promise<AgreementItem> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const existing = await this.prisma.agreement.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.AGREEMENT_NOT_FOUND, "Agreement not found");
    }
    if (existing.status !== AgreementStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.AGREEMENT_FROZEN,
        "Agreement is frozen after renewal or termination",
      );
    }
    const renewal = await this.prisma.agreement.findFirst({
      where: { previousAgreementId: id },
    });
    if (renewal) {
      throw new AppException(
        ErrorCode.AGREEMENT_FROZEN,
        "Agreement is frozen after renewal",
      );
    }

    const row = await this.prisma.agreement.update({
      where: { id },
      data: {
        ...(body.signedAt !== undefined
          ? { signedAt: isoDateToDate(body.signedAt) }
          : {}),
        ...(body.expiresAt !== undefined
          ? { expiresAt: isoDateToDate(body.expiresAt) }
          : {}),
        ...(body.contractValue !== undefined
          ? { contractValue: body.contractValue }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
      },
    });
    return this.toItem(row, asOf);
  }

  async renew(
    user: AuthRequestUser,
    id: string,
    body: AgreementRenewBody,
  ): Promise<AgreementItem> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const previous = await this.prisma.agreement.findUnique({ where: { id } });
    if (!previous) {
      throw new AppException(ErrorCode.AGREEMENT_NOT_FOUND, "Agreement not found");
    }
    if (previous.status !== AgreementStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.AGREEMENT_ALREADY_RENEWED,
        "Agreement cannot be renewed",
      );
    }

    const existingRenewal = await this.prisma.agreement.findFirst({
      where: { previousAgreementId: id },
    });
    if (existingRenewal) {
      throw new AppException(
        ErrorCode.AGREEMENT_ALREADY_RENEWED,
        "Agreement already renewed",
      );
    }

    const prevExpires = dateToIsoDate(previous.expiresAt);
    const newExpiresAt =
      body.newExpiresAt ?? addCalendarMonths(prevExpires, 12);

    try {
      const row = await this.prisma.transaction(async (tx) => {
        await tx.agreement.update({
          where: { id },
          data: { status: AgreementStatus.RENEWED },
        });
        return tx.agreement.create({
          data: {
            id: createId(),
            clientId: previous.clientId,
            siteId: previous.siteId,
            serviceType: previous.serviceType,
            signedAt: isoDateToDate(body.newSignedAt),
            expiresAt: isoDateToDate(newExpiresAt),
            contractValue: previous.contractValue,
            status: AgreementStatus.ACTIVE,
            previousAgreementId: id,
            notes: previous.notes,
            createdById: user.id,
          },
          include: {
            client: { select: { name: true } },
            site: { select: { name: true } },
          },
        });
      });
      return this.toItem(row, asOf);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
          ? ErrorCode.AGREEMENT_ALREADY_RENEWED
          : null;
      if (code) {
        throw new AppException(code, "Agreement already renewed");
      }
      // Unique partial index violation from Postgres
      if (
        typeof error === "object" &&
        error !== null &&
        "meta" in error &&
        String((error as { message?: string }).message ?? "").includes(
          "previous_agreement_id",
        )
      ) {
        throw new AppException(
          ErrorCode.AGREEMENT_ALREADY_RENEWED,
          "Agreement already renewed",
        );
      }
      throw error;
    }
  }

  async findExpiring(
    user: AuthRequestUser,
    query: AgreementExpiringQuery,
  ): Promise<AgreementPage> {
    return this.findPage(user, {
      page: query.page,
      pageSize: query.pageSize,
      expiringWithin: query.days,
    });
  }
}

void expiresWithin;
