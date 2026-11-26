import {
  canEditVisitChildren,
  createId,
  defineAbilityFor,
  ErrorCode,
  InvoiceStatus,
  Role,
  type VisitProductCreateBody,
  type VisitProductItem,
  type VisitProductList,
  type VisitProductUpdateBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { accessibleVisitWhere } from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import type { MeasurementUnit, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { mapVisitChildWriteError } from "./sql-errors";

type VisitProductRow = {
  id: string;
  visitId: string;
  productId: string;
  quantity: { toString(): string };
  unit: MeasurementUnit;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  product: { name: string; archived: boolean };
};

@Injectable()
export class VisitProductsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private async loadVisitAccess(user: AuthRequestUser, visitId: string) {
    const ability = this.abilityFor(user);
    if (
      !ability.can("manage", "VisitProduct") &&
      !ability.can("manage", "all") &&
      !ability.can("read", "Visit")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot access visit products");
    }

    const visit = await this.prisma.visit.findFirst({
      where: { AND: [{ id: visitId }, accessibleVisitWhere(ability)] },
      select: {
        id: true,
        createdById: true,
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
    return { visit, invoiceStatus, frozen };
  }

  private assertFieldWrite(user: AuthRequestUser, createdById: string, frozen: boolean): void {
    if (user.role !== Role.FIELD) return;
    if (createdById !== user.id) {
      throw new AppException(ErrorCode.FORBIDDEN, "FIELD may only edit own visits");
    }
    if (frozen) {
      throw new AppException(
        ErrorCode.VISIT_PRODUCTS_FROZEN,
        "Visit products are frozen after the invoice was issued",
      );
    }
  }

  private toItem(row: VisitProductRow, frozen: boolean): VisitProductItem {
    return {
      id: row.id,
      visitId: row.visitId,
      productId: row.productId,
      productName: row.product.name,
      productArchived: row.product.archived,
      quantity: row.quantity.toString(),
      unit: row.unit,
      notes: row.notes,
      frozen,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private include = {
    product: { select: { name: true, archived: true } },
  } satisfies Prisma.VisitProductInclude;

  async list(user: AuthRequestUser, visitId: string): Promise<VisitProductList> {
    const { frozen } = await this.loadVisitAccess(user, visitId);
    const rows = await this.prisma.visitProduct.findMany({
      where: { visitId },
      include: this.include,
      orderBy: { createdAt: "asc" },
    });
    return {
      items: rows.map((row) => this.toItem(row, frozen)),
      frozen,
    };
  }

  async create(
    user: AuthRequestUser,
    visitId: string,
    body: VisitProductCreateBody,
  ): Promise<VisitProductItem> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "VisitProduct") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage visit products");
    }

    const { visit, frozen } = await this.loadVisitAccess(user, visitId);
    this.assertFieldWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.VISIT_PRODUCTS_FROZEN,
        "Visit products are frozen after the invoice was issued",
      );
    }

    const product = await this.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) {
      throw new AppException(ErrorCode.PRODUCT_NOT_FOUND, "Product not found");
    }
    if (product.archived) {
      throw new AppException(
        ErrorCode.PRODUCT_ARCHIVED,
        "Cannot add an archived product to a visit",
      );
    }

    // One row per product per visit — sum quantity if already present.
    const existing = await this.prisma.visitProduct.findUnique({
      where: {
        visitId_productId: { visitId, productId: body.productId },
      },
      include: this.include,
    });

    try {
      if (existing) {
        const nextQty = (Number(existing.quantity) + Number(body.quantity)).toFixed(3);
        const row = await this.prisma.visitProduct.update({
          where: { id: existing.id },
          data: {
            quantity: nextQty,
            unit: body.unit,
            notes: body.notes === undefined ? existing.notes : body.notes,
          },
          include: this.include,
        });
        return this.toItem(row, false);
      }

      const row = await this.prisma.visitProduct.create({
        data: {
          id: createId(),
          visitId,
          productId: body.productId,
          quantity: body.quantity,
          unit: body.unit,
          notes: body.notes ?? null,
          createdById: user.id,
        },
        include: this.include,
      });
      return this.toItem(row, false);
    } catch (error) {
      mapVisitChildWriteError(error, "product");
    }
  }

  async update(
    user: AuthRequestUser,
    id: string,
    body: VisitProductUpdateBody,
  ): Promise<VisitProductItem> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "VisitProduct") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage visit products");
    }

    const existing = await this.prisma.visitProduct.findUnique({
      where: { id },
      include: this.include,
    });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit product not found");
    }

    const { visit, frozen } = await this.loadVisitAccess(user, existing.visitId);
    this.assertFieldWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.VISIT_PRODUCTS_FROZEN,
        "Visit products are frozen after the invoice was issued",
      );
    }

    try {
      const row = await this.prisma.visitProduct.update({
        where: { id },
        data: {
          quantity: body.quantity,
          unit: body.unit,
          notes: body.notes === undefined ? undefined : body.notes,
        },
        include: this.include,
      });
      return this.toItem(row, false);
    } catch (error) {
      mapVisitChildWriteError(error, "product");
    }
  }

  async remove(user: AuthRequestUser, id: string): Promise<void> {
    const ability = this.abilityFor(user);
    if (!ability.can("manage", "VisitProduct") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot manage visit products");
    }

    const existing = await this.prisma.visitProduct.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit product not found");
    }

    const { visit, frozen } = await this.loadVisitAccess(user, existing.visitId);
    this.assertFieldWrite(user, visit.createdById, frozen);
    if (frozen) {
      throw new AppException(
        ErrorCode.VISIT_PRODUCTS_FROZEN,
        "Visit products are frozen after the invoice was issued",
      );
    }

    try {
      await this.prisma.visitProduct.delete({ where: { id } });
    } catch (error) {
      mapVisitChildWriteError(error, "product");
    }
  }

  /** Exposed for freeze checks in tests / report. */
  isFrozenStatus(status: string | null): boolean {
    return !canEditVisitChildren({ id: "_" }, status);
  }

  issuedStatuses(): string[] {
    return [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE];
  }
}
