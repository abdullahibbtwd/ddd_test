import {
  ClientKind,
  createId,
  defineAbilityFor,
  DuplicateReason,
  ErrorCode,
  normalizeClientName,
  normalizePhone,
  PhoneValidationError,
  SiteStatus,
  validateEik,
  type ClientDuplicateCandidate,
  type ClientDuplicatesQuery,
  type ClientDuplicatesResponse,
  type ClientItem,
  type ClientListQuery,
  type ClientPage,
  type CreateClientBody,
  type DuplicateEikDetails,
  type UpdateClientBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { accessibleClientWhere } from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import type { Client, Prisma } from "../generated/prisma/client";
import { findSimilarClientsByNormalizedName } from "../prisma/find-similar-clients";
import { PrismaService } from "../prisma/prisma.service";

type ClientWithCount = Client & { _count?: { sites: number } };

@Injectable()
export class ClientsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private toItem(row: ClientWithCount): ClientItem {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      nameNormalized: row.nameNormalized,
      eik: row.eik,
      vatNumber: row.vatNumber,
      registeredAddress: row.registeredAddress,
      legalRepresentative: row.legalRepresentative,
      phone: row.phone,
      email: row.email,
      preferredPaymentMethod: row.preferredPaymentMethod,
      notes: row.notes,
      isActive: row.isActive,
      activeSiteCount: row._count?.sites ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private activeSiteCountInclude = {
    _count: {
      select: {
        sites: { where: { status: SiteStatus.ACTIVE } },
      },
    },
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

  private assertValidEikOrThrow(eik: string): void {
    if (!validateEik(eik)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "Invalid EIK", {
        code: ErrorCode.INVALID_EIK,
        path: "eik",
      });
    }
  }

  private async duplicateEikDetails(eik: string): Promise<DuplicateEikDetails | null> {
    const existing = await this.prisma.client.findFirst({
      where: { eik },
      select: { id: true, name: true, isActive: true },
    });
    if (!existing) return null;
    return {
      existingClientId: existing.id,
      existingName: existing.name,
      existingIsActive: existing.isActive,
    };
  }

  private async throwDuplicateEik(eik: string): Promise<never> {
    const details = await this.duplicateEikDetails(eik);
    throw new AppException(
      ErrorCode.DUPLICATE_EIK,
      "Client with this EIK already exists",
      details ?? undefined,
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  private orderBy(query: ClientListQuery): Prisma.ClientOrderByWithRelationInput {
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

  private searchWhere(search: string): Prisma.ClientWhereInput {
    const digits = search.replace(/\D/g, "");
    const or: Prisma.ClientWhereInput[] = [
      { name: { contains: search, mode: "insensitive" } },
      { eik: { startsWith: search } },
      { email: { contains: search, mode: "insensitive" } },
    ];
    if (digits.length > 0) {
      or.push({ phone: { contains: digits } });
    }
    return { OR: or };
  }

  async findPage(user: AuthRequestUser, query: ClientListQuery): Promise<ClientPage> {
    const scope = accessibleClientWhere(this.abilityFor(user));
    const where: Prisma.ClientWhereInput = {
      AND: [
        scope,
        query.kind ? { kind: query.kind } : {},
        { isActive: query.isActive === undefined ? true : query.isActive },
        query.search ? this.searchWhere(query.search) : {},
      ],
    };

    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: this.activeSiteCountInclude,
        orderBy: this.orderBy(query),
        skip,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<ClientItem> {
    const scope = accessibleClientWhere(this.abilityFor(user));
    const row = await this.prisma.client.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.activeSiteCountInclude,
    });
    if (!row) {
      throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
    }
    return this.toItem(row);
  }

  async create(body: CreateClientBody): Promise<ClientItem> {
    if (body.kind === ClientKind.COMPANY) {
      if (!body.eik) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, "Invalid EIK", {
          code: ErrorCode.INVALID_EIK,
          path: "eik",
        });
      }
      this.assertValidEikOrThrow(body.eik);
    } else if (body.eik) {
      this.assertValidEikOrThrow(body.eik);
    }

    const phone = this.normalizeOptionalPhone(body.phone ?? null) ?? null;
    const email = body.email === undefined ? null : body.email;
    const legalRepresentative =
      body.kind === ClientKind.COMPANY ? (body.legalRepresentative ?? null) : null;

    try {
      const row = await this.prisma.client.create({
        data: {
          id: createId(),
          kind: body.kind,
          name: body.name,
          nameNormalized: normalizeClientName(body.name),
          eik: body.eik ?? null,
          vatNumber: body.vatNumber ?? null,
          registeredAddress: body.registeredAddress ?? null,
          legalRepresentative,
          phone,
          email,
          preferredPaymentMethod: body.preferredPaymentMethod ?? null,
          notes: body.notes ?? null,
          isActive: true,
        },
        include: this.activeSiteCountInclude,
      });
      return this.toItem(row);
    } catch (error) {
      if (this.isUniqueViolation(error) && body.eik) {
        await this.throwDuplicateEik(body.eik);
      }
      throw error;
    }
  }

  async update(id: string, body: UpdateClientBody): Promise<ClientItem> {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
    }

    const reactivating = body.isActive === true;
    const archiving = body.isActive === false;

    if (!existing.isActive && !reactivating) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        "Archived clients can only be reactivated",
      );
    }

    if (!existing.isActive && reactivating) {
      const otherKeys = Object.entries(body).filter(
        ([key, value]) => key !== "isActive" && value !== undefined,
      );
      if (otherKeys.length > 0) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          "Archived clients can only be reactivated",
        );
      }
    }

    const nextKind = body.kind ?? existing.kind;
    const nextName = body.name ?? existing.name;
    const nextEik = body.eik !== undefined ? body.eik : existing.eik;

    if (nextKind === ClientKind.COMPANY) {
      if (!nextEik) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, "Invalid EIK", {
          code: ErrorCode.INVALID_EIK,
          path: "eik",
        });
      }
      this.assertValidEikOrThrow(nextEik);
    } else if (nextEik) {
      this.assertValidEikOrThrow(nextEik);
    }

    const data: Prisma.ClientUpdateInput = {};
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.name !== undefined) {
      data.name = body.name;
      data.nameNormalized = normalizeClientName(body.name);
    } else if (body.kind !== undefined) {
      data.nameNormalized = normalizeClientName(nextName);
    }
    if (body.eik !== undefined) data.eik = body.eik;
    if (body.vatNumber !== undefined) data.vatNumber = body.vatNumber;
    if (body.registeredAddress !== undefined) data.registeredAddress = body.registeredAddress;
    if (body.legalRepresentative !== undefined) {
      data.legalRepresentative =
        nextKind === ClientKind.COMPANY ? body.legalRepresentative : null;
    } else if (body.kind === ClientKind.INDIVIDUAL) {
      data.legalRepresentative = null;
    }
    if (body.phone !== undefined) {
      data.phone = this.normalizeOptionalPhone(body.phone) ?? null;
    }
    if (body.email !== undefined) data.email = body.email;
    if (body.preferredPaymentMethod !== undefined) {
      data.preferredPaymentMethod = body.preferredPaymentMethod;
    }
    if (body.notes !== undefined) data.notes = body.notes;
    if (archiving || reactivating) data.isActive = body.isActive;

    try {
      const row = await this.prisma.transaction(async (tx) => {
        if (archiving) {
          const activeSites = await tx.site.count({
            where: { clientId: id, status: SiteStatus.ACTIVE },
          });
          if (activeSites > 0) {
            throw new AppException(
              ErrorCode.CLIENT_HAS_ACTIVE_SITES,
              "Client has active sites and cannot be archived",
            );
          }
        }
        return tx.client.update({
          where: { id },
          data,
          include: this.activeSiteCountInclude,
        });
      });
      return this.toItem(row);
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (this.isUniqueViolation(error) && nextEik) {
        await this.throwDuplicateEik(nextEik);
      }
      throw error;
    }
  }

  async findDuplicates(
    user: AuthRequestUser,
    query: ClientDuplicatesQuery,
  ): Promise<ClientDuplicatesResponse> {
    const scope = accessibleClientWhere(this.abilityFor(user));
    const items: ClientDuplicateCandidate[] = [];
    const seen = new Set<string>();

    if (query.eik && query.eik.trim() !== "") {
      const eik = query.eik.trim();
      const same = await this.prisma.client.findFirst({
        where: {
          AND: [
            scope,
            { eik },
            ...(query.excludeId ? [{ id: { not: query.excludeId } }] : []),
          ],
        },
      });
      if (same) {
        seen.add(same.id);
        items.push({
          id: same.id,
          name: same.name,
          eik: same.eik,
          isActive: same.isActive,
          reason: DuplicateReason.SAME_EIK,
          score: 1,
        });
      }
    }

    if (query.name && query.name.trim() !== "") {
      const normalized = normalizeClientName(query.name);
      if (normalized.length > 0) {
        const similar = await findSimilarClientsByNormalizedName(this.prisma, normalized, {
          excludeId: query.excludeId,
          minScore: 0.6,
          limit: 5,
        });
        const scoped = await this.prisma.client.findMany({
          where: {
            AND: [{ id: { in: similar.map((s) => s.id) } }, scope],
          },
          select: { id: true },
        });
        const scopedIds = new Set(scoped.map((s) => s.id));
        for (const row of similar) {
          if (seen.has(row.id) || !scopedIds.has(row.id)) continue;
          seen.add(row.id);
          items.push({
            id: row.id,
            name: row.name,
            eik: row.eik,
            isActive: row.is_active,
            reason: DuplicateReason.SIMILAR_NAME,
            score: row.score,
          });
        }
      }
    }

    items.sort((a, b) => {
      if (a.reason !== b.reason) {
        return a.reason === DuplicateReason.SAME_EIK ? -1 : 1;
      }
      return b.score - a.score;
    });

    return { items: items.slice(0, 5) };
  }
}
