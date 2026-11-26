import {
  addCalendarDays,
  CertificateStatus,
  certificateStatus,
  createId,
  defineAbilityFor,
  ErrorCode,
  redactPersonForField,
  Role,
  todayInSofia,
  type CertificateCreateBody,
  type CertificateExpiringQuery,
  type CertificateUpdateBody,
  type CertifiedEmployeesQuery,
  type CertifiedEmployeesResponse,
  type HealthCertificateItem,
  type HealthCertificatePage,
  type SiteCertificateCounts,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type { HealthCertificate, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { auditReadPii } from "./pii-audit";

@Injectable()
export class HealthCertificatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertManage(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (
      !ability.can("manage", "HealthCertificate") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private async toItem(
    row: HealthCertificate,
    asOf: string,
  ): Promise<HealthCertificateItem> {
    const nextRenewalAt = dateToIsoDate(row.nextRenewalAt);
    let documentUrl: string | null = null;
    if (row.documentFileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: row.documentFileId },
      });
      if (file) {
        documentUrl = await this.storage.presignGet(file.storageKey, 3600);
      }
    }
    return {
      id: row.id,
      clientEmployeeId: row.clientEmployeeId,
      lastCertifiedAt: dateToIsoDate(row.lastCertifiedAt),
      nextRenewalAt,
      status: certificateStatus({ nextRenewalAt, asOf }),
      notes: row.notes,
      documentFileId: row.documentFileId,
      documentUrl,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listForEmployee(
    user: AuthRequestUser,
    employeeId: string,
  ): Promise<HealthCertificatePage> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const employee = await this.prisma.clientEmployee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new AppException(
        ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND,
        "Client employee not found",
      );
    }
    await auditReadPii(this.audit, {
      table: "client_employees",
      entityIds: [employeeId],
      actorUserId: user.id,
    });

    const rows = await this.prisma.healthCertificate.findMany({
      where: { clientEmployeeId: employeeId },
      orderBy: [{ nextRenewalAt: "desc" }, { createdAt: "desc" }],
    });
    await auditReadPii(this.audit, {
      table: "health_certificates",
      entityIds: rows.map((r) => r.id),
      actorUserId: user.id,
    });

    const items = await Promise.all(rows.map((r) => this.toItem(r, asOf)));
    return { items, total: items.length, page: 1, pageSize: items.length || 1 };
  }

  async create(
    user: AuthRequestUser,
    body: CertificateCreateBody,
  ): Promise<HealthCertificateItem> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const employee = await this.prisma.clientEmployee.findUnique({
      where: { id: body.clientEmployeeId },
    });
    if (!employee || employee.erasedAt) {
      throw new AppException(
        ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND,
        "Client employee not found",
      );
    }
    if (body.documentFileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: body.documentFileId },
      });
      if (!file) {
        throw new AppException(ErrorCode.NOT_FOUND, "Document file not found");
      }
    }
    const row = await this.prisma.healthCertificate.create({
      data: {
        id: createId(),
        clientEmployeeId: body.clientEmployeeId,
        lastCertifiedAt: isoDateToDate(body.lastCertifiedAt),
        nextRenewalAt: isoDateToDate(body.nextRenewalAt),
        notes: body.notes ?? null,
        documentFileId: body.documentFileId ?? null,
        createdById: user.id,
      },
    });
    return this.toItem(row, asOf);
  }

  /**
   * Date PATCH is for correcting a mistake only — a renewal is a NEW row.
   * Certificates are not frozen; corrections remain allowed.
   */
  async update(
    user: AuthRequestUser,
    id: string,
    body: CertificateUpdateBody,
  ): Promise<HealthCertificateItem> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const existing = await this.prisma.healthCertificate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.CERTIFICATE_NOT_FOUND,
        "Certificate not found",
      );
    }

    const last =
      body.lastCertifiedAt !== undefined
        ? body.lastCertifiedAt
        : dateToIsoDate(existing.lastCertifiedAt);
    const next =
      body.nextRenewalAt !== undefined
        ? body.nextRenewalAt
        : dateToIsoDate(existing.nextRenewalAt);
    if (next <= last) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        "Корекция на дати — подновяването е нов ред, не промяна на този",
      );
    }

    const row = await this.prisma.healthCertificate.update({
      where: { id },
      data: {
        ...(body.lastCertifiedAt !== undefined
          ? { lastCertifiedAt: isoDateToDate(body.lastCertifiedAt) }
          : {}),
        ...(body.nextRenewalAt !== undefined
          ? { nextRenewalAt: isoDateToDate(body.nextRenewalAt) }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.documentFileId !== undefined
          ? { documentFileId: body.documentFileId }
          : {}),
      },
    });
    return this.toItem(row, asOf);
  }

  async findExpiring(
    user: AuthRequestUser,
    query: CertificateExpiringQuery,
  ): Promise<HealthCertificatePage> {
    this.assertManage(user);
    const asOf = todayInSofia(new Date());
    const limit = addCalendarDays(asOf, query.days);

    const where: Prisma.HealthCertificateWhereInput = {
      nextRenewalAt: {
        gte: isoDateToDate(asOf),
        lte: isoDateToDate(limit),
      },
      clientEmployee: { erasedAt: null },
    };

    const [total, rows] = await Promise.all([
      this.prisma.healthCertificate.count({ where }),
      this.prisma.healthCertificate.findMany({
        where,
        orderBy: { nextRenewalAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    await auditReadPii(this.audit, {
      table: "health_certificates",
      entityIds: rows.map((r) => r.id),
      actorUserId: user.id,
    });

    const items = await Promise.all(rows.map((r) => this.toItem(r, asOf)));
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * FIELD redacted view: names + nextRenewalAt, job_title → '[скрито]', no notes.
   * Route: GET /api/sites/:siteId/certified-employees
   */
  async certifiedEmployeesForSite(
    user: AuthRequestUser,
    siteId: string,
    query: CertifiedEmployeesQuery,
  ): Promise<CertifiedEmployeesResponse> {
    const asOf = query.asOf ?? todayInSofia(new Date());
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
    }

    const ability = this.abilityFor(user);
    const canManage =
      ability.can("manage", "HealthCertificate") || ability.can("manage", "all");
    const fieldOk =
      user.role === Role.FIELD &&
      ability.can("read", "HealthCertificate") &&
      (user.areaIds ?? []).includes(site.areaId);

    if (!canManage && !fieldOk) {
      if (user.role === Role.FIELD) {
        throw new AppException(ErrorCode.NOT_FOUND, "Site not found");
      }
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }

    const employees = await this.prisma.clientEmployee.findMany({
      where: { siteId, erasedAt: null },
      include: {
        certificates: { orderBy: { nextRenewalAt: "desc" }, take: 1 },
      },
      orderBy: { fullName: "asc" },
    });

    await auditReadPii(this.audit, {
      table: "client_employees",
      entityIds: employees.map((e) => e.id),
      actorUserId: user.id,
    });
    const certIds = employees
      .flatMap((e) => e.certificates.map((c) => c.id))
      .filter(Boolean);
    if (certIds.length > 0) {
      await auditReadPii(this.audit, {
        table: "health_certificates",
        entityIds: certIds,
        actorUserId: user.id,
      });
    }

    const counts: SiteCertificateCounts = {
      current: 0,
      expiring: 0,
      expired: 0,
    };

    const items = employees.map((emp) => {
      const cert = emp.certificates[0];
      const nextRenewalAt = cert ? dateToIsoDate(cert.nextRenewalAt) : null;
      const status = nextRenewalAt
        ? certificateStatus({ nextRenewalAt, asOf })
        : null;
      if (status === CertificateStatus.CURRENT) counts.current += 1;
      else if (status === CertificateStatus.EXPIRING) counts.expiring += 1;
      else if (status === CertificateStatus.EXPIRED) counts.expired += 1;

      const redacted = redactPersonForField({
        fullName: emp.fullName,
        jobTitle: emp.jobTitle,
      });

      if (canManage) {
        return {
          id: emp.id,
          fullName: emp.fullName,
          jobTitle: emp.jobTitle ?? "",
          nextRenewalAt,
          status,
        };
      }
      return {
        id: emp.id,
        fullName: redacted.fullName,
        jobTitle: redacted.jobTitle,
        nextRenewalAt,
        status,
      };
    });

    return { items, counts };
  }

  async countsForSite(
    user: AuthRequestUser,
    siteId: string,
  ): Promise<SiteCertificateCounts> {
    this.assertManage(user);
    const result = await this.certifiedEmployeesForSite(user, siteId, {});
    return result.counts;
  }
}
