import {
  createId,
  defineAbilityFor,
  ErrorCode,
  Role,
  type ProductCreateBody,
  type ProductItem,
  type ProductListQuery,
  type ProductPage,
  type ProductUpdateBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import type { Prisma, Product } from "../generated/prisma/client";
import type { Decimal } from "../generated/prisma/internal/prismaNamespace";
import { PrismaService } from "../prisma/prisma.service";
import { isSqlState } from "./sql-errors";

@Injectable()
export class ProductsService {
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
    if (!ability.can("manage", "Product") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage products");
    }
  }

  private toItem(row: Product): ProductItem {
    return {
      id: row.id,
      name: row.name,
      activeSubstances: row.activeSubstances,
      formulation: row.formulation,
      permitNumber: row.permitNumber,
      permitHolder: row.permitHolder,
      antidote: row.antidote,
      ventilationPeriod: row.ventilationPeriod,
      exposurePeriod: row.exposurePeriod,
      recommendations: row.recommendations,
      defaultDosage: row.defaultDosage == null ? null : row.defaultDosage.toString(),
      defaultUnit: row.defaultUnit,
      archived: row.archived,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findPage(user: AuthRequestUser, query: ProductListQuery): Promise<ProductPage> {
    const ability = this.abilityFor(user);
    if (!ability.can("read", "Product") && !ability.can("manage", "Product") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot read products");
    }

    const where: Prisma.ProductWhereInput = {};
    if (query.archived === "false") where.archived = false;
    else if (query.archived === "true") where.archived = true;

    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { activeSubstances: { has: q } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ archived: "asc" }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<ProductItem> {
    const ability = this.abilityFor(user);
    if (!ability.can("read", "Product") && !ability.can("manage", "Product") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot read products");
    }
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) {
      throw new AppException(ErrorCode.PRODUCT_NOT_FOUND, "Product not found");
    }
    return this.toItem(row);
  }

  async create(user: AuthRequestUser, body: ProductCreateBody): Promise<ProductItem> {
    this.assertManage(user);
    try {
      const row = await this.prisma.product.create({
        data: {
          id: createId(),
          name: body.name,
          activeSubstances: body.activeSubstances ?? [],
          formulation: body.formulation,
          permitNumber: body.permitNumber ?? null,
          permitHolder: body.permitHolder ?? null,
          antidote: body.antidote ?? null,
          ventilationPeriod: body.ventilationPeriod ?? null,
          exposurePeriod: body.exposurePeriod ?? null,
          recommendations: body.recommendations ?? null,
          defaultDosage: body.defaultDosage ?? null,
          defaultUnit: body.defaultUnit ?? null,
          archived: false,
          createdById: user.id,
        },
      });
      return this.toItem(row);
    } catch (error) {
      if (isSqlState(error, "23505") || this.isPrismaUnique(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Active product name already exists");
      }
      throw error;
    }
  }

  async update(
    user: AuthRequestUser,
    id: string,
    body: ProductUpdateBody,
  ): Promise<ProductItem> {
    this.assertManage(user);
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.PRODUCT_NOT_FOUND, "Product not found");
    }

    const data: Prisma.ProductUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.activeSubstances !== undefined) data.activeSubstances = body.activeSubstances;
    if (body.formulation !== undefined) data.formulation = body.formulation;
    if (body.permitNumber !== undefined) data.permitNumber = body.permitNumber;
    if (body.permitHolder !== undefined) data.permitHolder = body.permitHolder;
    if (body.antidote !== undefined) data.antidote = body.antidote;
    if (body.ventilationPeriod !== undefined) data.ventilationPeriod = body.ventilationPeriod;
    if (body.exposurePeriod !== undefined) data.exposurePeriod = body.exposurePeriod;
    if (body.recommendations !== undefined) data.recommendations = body.recommendations;
    if (body.defaultDosage !== undefined) {
      data.defaultDosage = body.defaultDosage as unknown as Decimal | null;
    }
    if (body.defaultUnit !== undefined) data.defaultUnit = body.defaultUnit;
    if (body.archived !== undefined) data.archived = body.archived;

    try {
      const row = await this.prisma.product.update({ where: { id }, data });
      return this.toItem(row);
    } catch (error) {
      if (isSqlState(error, "23505") || this.isPrismaUnique(error)) {
        throw new AppException(ErrorCode.CONFLICT, "Active product name already exists");
      }
      throw error;
    }
  }

  /** FIELD may only read; used by route guards via @Can — keep role check explicit. */
  assertNotFieldManage(user: AuthRequestUser): void {
    if (user.role === Role.FIELD) {
      throw new AppException(ErrorCode.FORBIDDEN, "FIELD cannot manage products");
    }
  }

  private isPrismaUnique(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
