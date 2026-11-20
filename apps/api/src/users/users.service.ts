import {
  AuditSecurityAction,
  createId,
  ErrorCode,
  normalizePhone,
  PhoneValidationError,
  Role,
  type CreateUserBody,
  type CreateUserResponse,
  type ResetPasswordResponse,
  type UpdateUserBody,
  type UserItem,
  type UserListQuery,
  type UserPage,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { generateTemporaryPassword } from "../auth/temp-password";
import type { AuthRequestUser } from "../auth/auth.types";
import { hashPassword } from "../auth/password";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/errors/app.exception";
import type { Prisma } from "../generated/prisma/client";
import { lockActiveAdminRows } from "../prisma/lock-active-admins";
import { PrismaService } from "../prisma/prisma.service";

type UserWithAreas = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userAreas: Array<{ area: { id: string; name: string; isActive: boolean } }>;
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private toItem(row: UserWithAreas): UserItem {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      areas: row.userAreas
        .filter((ua) => ua.area.isActive)
        .map((ua) => ({ id: ua.area.id, name: ua.area.name })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private areaInclude = {
    userAreas: {
      include: { area: { select: { id: true, name: true, isActive: true } } },
      orderBy: { area: { name: "asc" as const } },
    },
  };

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

  async findPage(query: UserListQuery): Promise<UserPage> {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.areaId) {
      where.userAreas = { some: { areaId: query.areaId } };
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
        include: this.areaInclude,
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row as UserWithAreas)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<UserItem> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      include: this.areaInclude,
    });
    if (!row) {
      throw new AppException(ErrorCode.NOT_FOUND, "User not found");
    }
    return this.toItem(row as UserWithAreas);
  }

  async create(body: CreateUserBody): Promise<CreateUserResponse> {
    const email = body.email.trim().toLowerCase();
    const phone = this.normalizeOptionalPhone(body.phone ?? null) ?? null;
    const areaIds = [...new Set(body.areaIds ?? [])];

    if (areaIds.length > 0) {
      await this.assertAreasExist(areaIds);
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const id = createId();

    try {
      const row = await this.prisma.transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id,
            email,
            name: body.name,
            phone,
            role: body.role,
            passwordHash,
            mustChangePassword: true,
            passwordChangedAt: new Date(),
          },
        });

        if (areaIds.length > 0) {
          await tx.userArea.createMany({
            data: areaIds.map((areaId) => ({
              id: createId(),
              userId: user.id,
              areaId,
            })),
          });
        }

        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          include: this.areaInclude,
        });
      });

      return {
        ...this.toItem(row as UserWithAreas),
        temporaryPassword,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Email already exists");
      }
      throw error;
    }
  }

  async update(
    actor: AuthRequestUser,
    id: string,
    body: UpdateUserBody,
  ): Promise<UserItem> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "User not found");
    }

    if (actor.id === id) {
      if (body.role !== undefined && body.role !== existing.role) {
        throw new AppException(
          ErrorCode.SELF_MODIFICATION_FORBIDDEN,
          "Cannot change your own role",
        );
      }
      if (body.isActive === false) {
        throw new AppException(
          ErrorCode.SELF_MODIFICATION_FORBIDDEN,
          "Cannot deactivate your own account",
        );
      }
    }

    const phone =
      body.phone !== undefined ? this.normalizeOptionalPhone(body.phone) : undefined;
    const areaIds =
      body.areaIds !== undefined ? [...new Set(body.areaIds)] : undefined;
    if (areaIds) {
      await this.assertAreasExist(areaIds);
    }

    const nextRole = body.role ?? existing.role;
    const nextActive = body.isActive ?? existing.isActive;
    const roleOrActiveChanging =
      (body.role !== undefined && body.role !== existing.role) ||
      (body.isActive !== undefined && body.isActive !== existing.isActive);

    const row = await this.prisma.transaction(async (tx) => {
      if (roleOrActiveChanging) {
        const admins = await lockActiveAdminRows(tx);
        const remaining = admins.filter((a) => {
          if (a.id !== id) return true;
          return nextRole === Role.ADMIN && nextActive;
        });
        if (remaining.length === 0) {
          throw new AppException(
            ErrorCode.LAST_ADMIN_REQUIRED,
            "At least one active admin is required",
          );
        }
      }

      await tx.user.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });

      if (areaIds !== undefined) {
        const current = await tx.userArea.findMany({
          where: { userId: id },
          select: { id: true, areaId: true },
        });
        const currentIds = new Set(
          current.map((c: { id: string; areaId: string }) => c.areaId),
        );
        const nextIds = new Set(areaIds);

        const toRemove = current.filter(
          (c: { id: string; areaId: string }) => !nextIds.has(c.areaId),
        );
        for (const assignment of toRemove) {
          await tx.userArea.delete({ where: { id: assignment.id } });
        }

        for (const areaId of areaIds) {
          if (!currentIds.has(areaId)) {
            await tx.userArea.create({
              data: { id: createId(), userId: id, areaId },
            });
          }
        }
      }

      if (body.isActive === false) {
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        include: this.areaInclude,
      });
    });

    return this.toItem(row as UserWithAreas);
  }

  async resetPassword(id: string): Promise<ResetPasswordResponse> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "User not found");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await this.prisma.transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
      });
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.log({
      action: AuditSecurityAction.PASSWORD_RESET_BY_ADMIN,
      entityType: "users",
      entityId: id,
      meta: { targetUserId: id },
    });

    return { temporaryPassword };
  }

  private async assertAreasExist(areaIds: string[]): Promise<void> {
    if (areaIds.length === 0) return;
    const count = await this.prisma.area.count({
      where: { id: { in: areaIds } },
    });
    if (count !== areaIds.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "One or more areas do not exist");
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
