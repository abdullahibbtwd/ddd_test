import {
  createId,
  defineAbilityFor,
  EmployeeRoleOnVisit,
  ErrorCode,
  isFieldWindowErrorForDate,
  isFieldWindowErrorForEdit,
  Role,
  SiteStatus,
  todayInSofia,
  VisitStatus,
  type CancelVisitBody,
  type CreateVisitBody,
  type UpdateVisitBody,
  type VisitEmployeeInput,
  type VisitItem,
  type VisitListQuery,
  type VisitPage,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import {
  accessibleSiteWhere,
  accessibleVisitWhere,
} from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type {
  EmployeeRoleOnVisit as PrismaEmployeeRole,
  Prisma,
  ServiceType as PrismaServiceType,
  VisitStatus as PrismaVisitStatus,
} from "../generated/prisma/client";
import type { Decimal } from "../generated/prisma/internal/prismaNamespace";
import { PrismaService } from "../prisma/prisma.service";

type VisitEmployeeRow = {
  userId: string;
  roleOnVisit: PrismaEmployeeRole;
  user: { id: string; name: string };
};

type VisitRow = {
  id: string;
  siteId: string;
  visitDate: Date;
  treatmentType: PrismaServiceType;
  chargedAmount: Decimal;
  rateIncludesVat: boolean;
  subscriptionId: string | null;
  notes: string | null;
  status: PrismaVisitStatus;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancelReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  clientMutationId: string;
  site: { id: string; name: string };
  employees: VisitEmployeeRow[];
};

/**
 * TODO(Phase 6): replace stub with a real check against the invoice link.
 * Until invoicing exists, OFFICE/ADMIN may always edit/cancel (never "invoiced").
 */
function isVisitInvoiced(_visitId: string): boolean {
  return false;
}

function moneyEqual(a: Decimal | number | string, b: number): boolean {
  return Number(a).toFixed(2) === Number(b).toFixed(2);
}

function notesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = a == null || a === "" ? null : a;
  const nb = b == null || b === "" ? null : b;
  return na === nb;
}

function employeeSetKey(employees: { userId: string; role: string }[]): string {
  return [...employees]
    .map((e) => `${e.userId}:${e.role}`)
    .sort()
    .join("|");
}

@Injectable()
export class VisitsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private include: Prisma.VisitInclude = {
    site: { select: { id: true, name: true } },
    employees: {
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ roleOnVisit: "asc" }, { userId: "asc" }],
    },
  };

  private toItem(row: VisitRow): VisitItem {
    return {
      id: row.id,
      siteId: row.siteId,
      site: { id: row.site.id, name: row.site.name },
      visitDate: dateToIsoDate(row.visitDate),
      treatmentType: row.treatmentType,
      chargedAmount: Number(row.chargedAmount),
      rateIncludesVat: row.rateIncludesVat,
      subscriptionId: row.subscriptionId,
      notes: row.notes,
      status: row.status,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledBy: row.cancelledById,
      cancelReason: row.cancelReason,
      createdBy: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      clientMutationId: row.clientMutationId,
      employees: row.employees.map((e) => ({
        userId: e.userId,
        fullName: e.user.name,
        role: e.roleOnVisit,
      })),
    };
  }

  private assertFieldDateWindow(user: AuthRequestUser, visitDate: string, now = new Date()) {
    if (user.role !== Role.FIELD) return;
    const today = todayInSofia(now);
    const code = isFieldWindowErrorForDate(visitDate, today);
    if (code) {
      throw new AppException(ErrorCode.VISIT_DATE_OUT_OF_WINDOW, "Visit date out of FIELD window");
    }
  }

  private assertFieldEditWindow(user: AuthRequestUser, createdAt: Date, now = new Date()) {
    if (user.role !== Role.FIELD) return;
    const code = isFieldWindowErrorForEdit(createdAt.toISOString(), now.toISOString());
    if (code) {
      throw new AppException(ErrorCode.VISIT_EDIT_WINDOW_EXPIRED, "FIELD edit window expired");
    }
  }

  private assertOwner(user: AuthRequestUser, createdById: string) {
    if (user.role !== Role.FIELD) return;
    if (createdById !== user.id) {
      throw new AppException(ErrorCode.VISIT_NOT_OWNER, "FIELD may only edit own visits");
    }
  }

  private assertNotFuture(visitDate: string, now = new Date()) {
    const today = todayInSofia(now);
    if (visitDate > today) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "visitDate cannot be in the future", [
        { path: "visitDate", message: "visitDate cannot be in the future" },
      ]);
    }
  }

  private resolveEmployees(
    user: AuthRequestUser,
    employees: VisitEmployeeInput[] | undefined,
  ): VisitEmployeeInput[] {
    if (!employees || employees.length === 0) {
      return [{ userId: user.id, role: EmployeeRoleOnVisit.LEAD }];
    }
    return employees;
  }

  private async assertActiveUsers(userIds: string[]): Promise<void> {
    const unique = [...new Set(userIds)];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "One or more employees are inactive", [
        { path: "employees", message: "All employees must be active users" },
      ]);
    }
  }

  private async loadCurrentSubscription(siteId: string, asOfDate: string) {
    const asOf = isoDateToDate(asOfDate);
    return this.prisma.subscription.findFirst({
      where: {
        siteId,
        startDate: { lte: asOf },
        OR: [{ endDate: null }, { endDate: { gte: asOf } }],
      },
      orderBy: { startDate: "desc" },
    });
  }

  private async assertSiteInScope(
    user: AuthRequestUser,
    siteId: string,
    opts: { forWrite: boolean },
  ): Promise<{ id: string; status: string; areaId: string; name: string }> {
    const ability = this.abilityFor(user);
    const scope = accessibleSiteWhere(ability);
    const site = await this.prisma.site.findFirst({
      where: { AND: [{ id: siteId }, scope] },
      select: { id: true, status: true, areaId: true, name: true },
    });
    if (!site) {
      if (opts.forWrite && user.role === Role.FIELD) {
        // Exists but out of scope → 403; missing → also hide as out of scope for FIELD writes.
        const exists = await this.prisma.site.findUnique({
          where: { id: siteId },
          select: { id: true },
        });
        if (exists) {
          throw new AppException(ErrorCode.FORBIDDEN, "Site out of scope for create");
        }
        throw new AppException(ErrorCode.SITE_OUT_OF_SCOPE, "Site out of scope");
      }
      throw new AppException(ErrorCode.SITE_OUT_OF_SCOPE, "Site out of scope");
    }
    return site;
  }

  private bodiesMatch(
    existing: VisitRow,
    body: CreateVisitBody,
    resolvedEmployees: VisitEmployeeInput[],
    chargedAmount: number,
    rateIncludesVat: boolean,
    subscriptionId: string | null,
  ): boolean {
    if (existing.siteId !== body.siteId) return false;
    if (dateToIsoDate(existing.visitDate) !== body.visitDate) return false;
    if (existing.treatmentType !== body.treatmentType) return false;
    if (!moneyEqual(existing.chargedAmount, chargedAmount)) return false;
    if (existing.rateIncludesVat !== rateIncludesVat) return false;
    if ((existing.subscriptionId ?? null) !== (subscriptionId ?? null)) return false;
    if (!notesEqual(existing.notes, body.notes ?? null)) return false;
    const existingSet = employeeSetKey(
      existing.employees.map((e) => ({ userId: e.userId, role: e.roleOnVisit })),
    );
    const incomingSet = employeeSetKey(resolvedEmployees);
    return existingSet === incomingSet;
  }

  async findPage(user: AuthRequestUser, query: VisitListQuery): Promise<VisitPage> {
    const ability = this.abilityFor(user);
    const scope = accessibleVisitWhere(ability);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    if (user.role === Role.FIELD && !query.siteId) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "siteId is required for FIELD", [
        { path: "siteId", message: "siteId is required for FIELD" },
      ]);
    }

    const where: Prisma.VisitWhereInput = { AND: [scope] };
    if (query.siteId) {
      (where.AND as Prisma.VisitWhereInput[]).push({ siteId: query.siteId });
    }
    if (query.from) {
      (where.AND as Prisma.VisitWhereInput[]).push({
        visitDate: { gte: isoDateToDate(query.from) },
      });
    }
    if (query.to) {
      (where.AND as Prisma.VisitWhereInput[]).push({
        visitDate: { lte: isoDateToDate(query.to) },
      });
    }
    if (query.treatmentType) {
      (where.AND as Prisma.VisitWhereInput[]).push({ treatmentType: query.treatmentType });
    }
    if (query.status) {
      (where.AND as Prisma.VisitWhereInput[]).push({ status: query.status });
    }

    const [total, rows] = await Promise.all([
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        include: this.include,
        orderBy: [{ visitDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row as unknown as VisitRow)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<VisitItem> {
    const ability = this.abilityFor(user);
    const scope = accessibleVisitWhere(ability);
    const row = await this.prisma.visit.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.include,
    });
    if (!row) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit not found");
    }
    return this.toItem(row as unknown as VisitRow);
  }

  async create(
    user: AuthRequestUser,
    body: CreateVisitBody,
  ): Promise<{ item: VisitItem; created: boolean }> {
    this.assertNotFuture(body.visitDate);
    this.assertFieldDateWindow(user, body.visitDate);

    const site = await this.assertSiteInScope(user, body.siteId, { forWrite: true });
    if (site.status !== SiteStatus.ACTIVE) {
      throw new AppException(ErrorCode.SITE_TERMINATED, "Site is terminated");
    }

    const currentSub = await this.loadCurrentSubscription(body.siteId, body.visitDate);
    let chargedAmount: number;
    let rateIncludesVat: boolean;
    let subscriptionId: string | null = null;

    if (currentSub) {
      subscriptionId = currentSub.id;
      if (
        body.chargedAmount !== undefined &&
        (user.role === Role.OFFICE || user.role === Role.ADMIN)
      ) {
        chargedAmount = body.chargedAmount;
        rateIncludesVat =
          body.rateIncludesVat !== undefined
            ? body.rateIncludesVat
            : currentSub.rateIncludesVat;
      } else {
        // FIELD (and OFFICE/ADMIN without override) copy the subscription snapshot.
        chargedAmount = Number(currentSub.rate);
        rateIncludesVat = currentSub.rateIncludesVat;
      }
    } else {
      if (body.chargedAmount === undefined) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          "chargedAmount is required for one-off visits",
          [{ path: "chargedAmount", message: "chargedAmount is required when no subscription" }],
        );
      }
      chargedAmount = body.chargedAmount;
      rateIncludesVat = body.rateIncludesVat ?? false;
    }

    const resolvedEmployees = this.resolveEmployees(user, body.employees);
    await this.assertActiveUsers(resolvedEmployees.map((e) => e.userId));

    // Idempotent retry path: existing row with same (created_by, client_mutation_id).
    const existing = await this.prisma.visit.findUnique({
      where: {
        createdById_clientMutationId: {
          createdById: user.id,
          clientMutationId: body.clientMutationId,
        },
      },
      include: this.include,
    });
    if (existing) {
      if (
        this.bodiesMatch(
          existing as unknown as VisitRow,
          body,
          resolvedEmployees,
          chargedAmount,
          rateIncludesVat,
          subscriptionId,
        )
      ) {
        return { item: this.toItem(existing as unknown as VisitRow), created: false };
      }
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY,
        "Idempotency key reused with a different body",
      );
    }

    const visitId = createId();
    try {
      const row = await this.prisma.transaction(async (tx) => {
        await tx.visit.create({
          data: {
            id: visitId,
            siteId: body.siteId,
            visitDate: isoDateToDate(body.visitDate),
            treatmentType: body.treatmentType,
            chargedAmount,
            rateIncludesVat,
            subscriptionId,
            notes: body.notes ?? null,
            status: VisitStatus.ACTIVE,
            createdById: user.id,
            clientMutationId: body.clientMutationId,
          },
        });
        await tx.visitEmployee.createMany({
          data: resolvedEmployees.map((e) => ({
            id: createId(),
            visitId,
            userId: e.userId,
            roleOnVisit: e.role,
          })),
        });
        return tx.visit.findUniqueOrThrow({
          where: { id: visitId },
          include: this.include,
        });
      });
      return { item: this.toItem(row as unknown as VisitRow), created: true };
    } catch (error) {
      if (this.isUniqueMutationViolation(error)) {
        const raced = await this.prisma.visit.findUnique({
          where: {
            createdById_clientMutationId: {
              createdById: user.id,
              clientMutationId: body.clientMutationId,
            },
          },
          include: this.include,
        });
        if (!raced) throw error;
        if (
          this.bodiesMatch(
            raced as unknown as VisitRow,
            body,
            resolvedEmployees,
            chargedAmount,
            rateIncludesVat,
            subscriptionId,
          )
        ) {
          return { item: this.toItem(raced as unknown as VisitRow), created: false };
        }
        throw new AppException(
          ErrorCode.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY,
          "Idempotency key reused with a different body",
        );
      }
      if (this.isSubscriptionWindowViolation(error)) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          "visitDate is outside the linked subscription window",
          [
            {
              path: "visitDate",
              message: "visitDate must fall within the subscription period",
            },
          ],
        );
      }
      throw error;
    }
  }

  async update(
    user: AuthRequestUser,
    id: string,
    body: UpdateVisitBody,
  ): Promise<VisitItem> {
    const ability = this.abilityFor(user);
    const scope = accessibleVisitWhere(ability);
    const existing = await this.prisma.visit.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.include,
    });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit not found");
    }
    if (existing.status === VisitStatus.CANCELLED) {
      throw new AppException(ErrorCode.VISIT_ALREADY_CANCELLED, "Visit already cancelled");
    }

    this.assertOwner(user, existing.createdById);
    this.assertFieldEditWindow(user, existing.createdAt);

    if (isVisitInvoiced(id)) {
      throw new AppException(ErrorCode.FORBIDDEN, "Visit is invoiced and cannot be edited");
    }

    if (body.visitDate !== undefined) {
      this.assertNotFuture(body.visitDate);
      this.assertFieldDateWindow(user, body.visitDate);
    }

    if (
      user.role === Role.FIELD &&
      (body.chargedAmount !== undefined || body.rateIncludesVat !== undefined)
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        "FIELD cannot change charged amount or VAT flag",
      );
    }

    if (body.employees) {
      await this.assertActiveUsers(body.employees.map((e) => e.userId));
    }

    const nextDate = body.visitDate ?? dateToIsoDate(existing.visitDate);
    const nextSubId =
      body.subscriptionId !== undefined ? body.subscriptionId : existing.subscriptionId;

    try {
      const row = await this.prisma.transaction(async (tx) => {
        await tx.visit.update({
          where: { id },
          data: {
            ...(body.visitDate !== undefined
              ? { visitDate: isoDateToDate(body.visitDate) }
              : {}),
            ...(body.treatmentType !== undefined
              ? { treatmentType: body.treatmentType }
              : {}),
            ...(body.chargedAmount !== undefined
              ? { chargedAmount: body.chargedAmount }
              : {}),
            ...(body.rateIncludesVat !== undefined
              ? { rateIncludesVat: body.rateIncludesVat }
              : {}),
            ...(body.subscriptionId !== undefined
              ? { subscriptionId: body.subscriptionId }
              : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
          },
        });

        if (body.employees) {
          await tx.visitEmployee.deleteMany({ where: { visitId: id } });
          await tx.visitEmployee.createMany({
            data: body.employees.map((e) => ({
              id: createId(),
              visitId: id,
              userId: e.userId,
              roleOnVisit: e.role,
            })),
          });
        }

        // Re-validate subscription window after potential date/sub change.
        void nextDate;
        void nextSubId;

        return tx.visit.findUniqueOrThrow({
          where: { id },
          include: this.include,
        });
      });
      return this.toItem(row as unknown as VisitRow);
    } catch (error) {
      if (this.isSubscriptionWindowViolation(error)) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          "visitDate is outside the linked subscription window",
          [
            {
              path: "visitDate",
              message: "visitDate must fall within the subscription period",
            },
          ],
        );
      }
      throw error;
    }
  }

  async cancel(
    user: AuthRequestUser,
    id: string,
    body: CancelVisitBody,
  ): Promise<VisitItem> {
    const ability = this.abilityFor(user);
    const scope = accessibleVisitWhere(ability);
    const existing = await this.prisma.visit.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.include,
    });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit not found");
    }
    if (existing.status === VisitStatus.CANCELLED) {
      throw new AppException(ErrorCode.VISIT_ALREADY_CANCELLED, "Visit already cancelled");
    }

    this.assertOwner(user, existing.createdById);
    this.assertFieldEditWindow(user, existing.createdAt);

    if (isVisitInvoiced(id)) {
      throw new AppException(ErrorCode.FORBIDDEN, "Visit is invoiced and cannot be cancelled");
    }

    const row = await this.prisma.visit.update({
      where: { id },
      data: {
        status: VisitStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancelReason: body.cancelReason.trim(),
      },
      include: this.include,
    });
    return this.toItem(row as unknown as VisitRow);
  }

  isUniqueMutationViolation(error: unknown): boolean {
    const walk = (value: unknown, depth = 0): boolean => {
      if (depth > 6 || value == null || typeof value !== "object") return false;
      const obj = value as Record<string, unknown>;
      if (obj.code === "P2002") {
        const target = obj.meta && typeof obj.meta === "object"
          ? (obj.meta as { target?: string[] | string }).target
          : undefined;
        const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
        if (/client_mutation|created_by/i.test(text) || text === "") return true;
      }
      if (
        typeof obj.message === "string" &&
        /visits_created_by_client_mutation_id|unique.*client_mutation/i.test(obj.message)
      ) {
        return true;
      }
      // Postgres unique_violation
      if (obj.code === "23505") return true;
      for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
        if (key in obj && walk(obj[key], depth + 1)) return true;
      }
      return false;
    };
    return walk(error);
  }

  isSubscriptionWindowViolation(error: unknown): boolean {
    const walk = (value: unknown, depth = 0): boolean => {
      if (depth > 6 || value == null || typeof value !== "object") return false;
      const obj = value as Record<string, unknown>;
      if (
        typeof obj.message === "string" &&
        /visits_subscription_window/i.test(obj.message)
      ) {
        return true;
      }
      for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
        if (key in obj && walk(obj[key], depth + 1)) return true;
      }
      return false;
    };
    return walk(error);
  }
}
