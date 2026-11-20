import {
  createId,
  defineAbilityFor,
  ErrorCode,
  Role,
  type AreaItem,
  type AreaListQuery,
  type AreaPage,
  type CreateAreaBody,
  type UpdateAreaBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { accessibleAreaWhere } from "../auth/accessible-area-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AreasService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private toItem(
    // Prisma include shapes vary by call site; narrow only what we read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row: any,
    opts: { includeUserCount: boolean; includeUsers: boolean },
  ): AreaItem {
    const item: AreaItem = {
      id: row.id as string,
      name: row.name as string,
      isActive: row.isActive as boolean,
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
    if (opts.includeUserCount && row._count) {
      item.userCount = row._count.userAreas as number;
    }
    if (opts.includeUsers && Array.isArray(row.userAreas)) {
      item.users = row.userAreas.map(
        (ua: {
          user: {
            id: string;
            name: string;
            email: string;
            role: string;
            isActive: boolean;
          };
        }) => ({
          id: ua.user.id,
          name: ua.user.name,
          email: ua.user.email,
          role: ua.user.role,
          isActive: ua.user.isActive,
        }),
      );
    }
    return item;
  }

  /** True when the ability's Area scope includes this id (or is unrestricted). */
  private isAreaInScope(user: AuthRequestUser, areaId: string): boolean {
    const scope = accessibleAreaWhere(this.abilityFor(user)) as {
      id?: { in?: string[] };
    };
    if (!scope.id?.in) return true;
    return scope.id.in.includes(areaId);
  }

  async findPage(user: AuthRequestUser, query: AreaListQuery): Promise<AreaPage> {
    const ability = this.abilityFor(user);
    const scope = accessibleAreaWhere(ability);
    const isAdmin = user.role === Role.ADMIN;

    const where: Prisma.AreaWhereInput = {
      AND: [
        scope,
        // ADMIN: all (incl. inactive) unless filtered; OFFICE/FIELD: active only
        isAdmin
          ? query.isActive === undefined
            ? {}
            : { isActive: query.isActive }
          : { isActive: true },
        query.search
          ? { name: { contains: query.search, mode: "insensitive" } }
          : {},
      ],
    };

    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.area.count({ where }),
      this.prisma.area.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
        include: isAdmin ? { _count: { select: { userAreas: true } } } : undefined,
      }),
    ]);

    return {
      items: rows.map((row) =>
        this.toItem(row, { includeUserCount: isAdmin, includeUsers: false }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<AreaItem> {
    const isAdmin = user.role === Role.ADMIN;

    const row = await this.prisma.area.findUnique({
      where: { id },
      include: {
        _count: isAdmin ? { select: { userAreas: true } } : undefined,
        userAreas: isAdmin
          ? {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                  },
                },
              },
              orderBy: { user: { name: "asc" } },
            }
          : undefined,
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.NOT_FOUND, "Area not found");
    }

    // Out of scope / inactive for non-admin → 404 (do not leak existence)
    if (!isAdmin && !row.isActive) {
      throw new AppException(ErrorCode.NOT_FOUND, "Area not found");
    }
    if (!this.isAreaInScope(user, row.id)) {
      throw new AppException(ErrorCode.NOT_FOUND, "Area not found");
    }

    return this.toItem(row, {
      includeUserCount: isAdmin,
      includeUsers: isAdmin,
    });
  }

  async create(body: CreateAreaBody): Promise<AreaItem> {
    try {
      const row = await this.prisma.area.create({
        data: {
          id: createId(),
          name: body.name,
          isActive: true,
        },
        include: { _count: { select: { userAreas: true } } },
      });
      return this.toItem(row, { includeUserCount: true, includeUsers: false });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Area name already exists");
      }
      throw error;
    }
  }

  async update(id: string, body: UpdateAreaBody): Promise<AreaItem> {
    const existing = await this.prisma.area.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Area not found");
    }

    try {
      const row = await this.prisma.area.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: {
          _count: { select: { userAreas: true } },
          userAreas: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  isActive: true,
                },
              },
            },
            orderBy: { user: { name: "asc" } },
          },
        },
      });
      return this.toItem(row, { includeUserCount: true, includeUsers: true });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Area name already exists");
      }
      throw error;
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
}
