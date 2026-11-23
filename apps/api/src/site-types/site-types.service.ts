import {
  createId,
  ErrorCode,
  Role,
  type CreateSiteTypeBody,
  type SiteTypeItem,
  type SiteTypeListQuery,
  type SiteTypeListResponse,
  type UpdateSiteTypeBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import type { SiteType } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SiteTypesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private toItem(row: SiteType): SiteTypeItem {
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  async findAll(user: AuthRequestUser, query: SiteTypeListQuery): Promise<SiteTypeListResponse> {
    const includeInactive = query.includeInactive === true;
    if (includeInactive && user.role !== Role.ADMIN) {
      throw new AppException(ErrorCode.FORBIDDEN, "Only ADMIN may include inactive site types");
    }

    const rows = await this.prisma.siteType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
    return { items: rows.map((row) => this.toItem(row)) };
  }

  private async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const clash = await this.prisma.siteType.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new AppException(ErrorCode.CONFLICT, "Site type name already exists");
    }
  }

  async create(body: CreateSiteTypeBody): Promise<SiteTypeItem> {
    await this.assertNameAvailable(body.name);
    try {
      const row = await this.prisma.siteType.create({
        data: {
          id: createId(),
          name: body.name,
          isActive: true,
        },
      });
      return this.toItem(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Site type name already exists");
      }
      throw error;
    }
  }

  async update(id: string, body: UpdateSiteTypeBody): Promise<SiteTypeItem> {
    const existing = await this.prisma.siteType.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site type not found");
    }

    if (body.name !== undefined) {
      await this.assertNameAvailable(body.name, id);
    }

    try {
      const row = await this.prisma.siteType.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      return this.toItem(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Site type name already exists");
      }
      throw error;
    }
  }
}
