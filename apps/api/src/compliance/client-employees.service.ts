import {
  AuditSecurityAction,
  certificateStatus,
  createId,
  defineAbilityFor,
  ErrorCode,
  expiresWithin,
  Role,
  todayInSofia,
  type ClientEmployeeCreateBody,
  type ClientEmployeeExport,
  type ClientEmployeeItem,
  type ClientEmployeeListQuery,
  type ClientEmployeePage,
  type ClientEmployeeUpdateBody,
  type EraseRequestBody,
  type HealthCertificateItem,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type {
  ClientEmployee,
  HealthCertificate,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { auditReadPii } from "./pii-audit";

type EmployeeWithRelations = ClientEmployee & {
  client?: { name: string } | null;
  site?: { name: string } | null;
  certificates?: HealthCertificate[];
};

@Injectable()
export class ClientEmployeesService {
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

  private assertOfficeRead(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (
      !ability.can("read", "ClientEmployee") &&
      !ability.can("manage", "ClientEmployee") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private assertWrite(user: AuthRequestUser): void {
    const ability = this.abilityFor(user);
    if (
      !ability.can("create", "ClientEmployee") &&
      !ability.can("update", "ClientEmployee") &&
      !ability.can("manage", "ClientEmployee") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private toCertificateItem(
    row: HealthCertificate,
    asOf: string,
  ): HealthCertificateItem {
    const nextRenewalAt = dateToIsoDate(row.nextRenewalAt);
    return {
      id: row.id,
      clientEmployeeId: row.clientEmployeeId,
      lastCertifiedAt: dateToIsoDate(row.lastCertifiedAt),
      nextRenewalAt,
      status: certificateStatus({ nextRenewalAt, asOf }),
      notes: row.notes,
      documentFileId: row.documentFileId,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toItem(row: EmployeeWithRelations, asOf: string): ClientEmployeeItem {
    const certs = (row.certificates ?? [])
      .slice()
      .sort((a, b) => (a.nextRenewalAt < b.nextRenewalAt ? 1 : -1));
    const latest = certs[0] ?? null;
    const latestItem = latest ? this.toCertificateItem(latest, asOf) : null;
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client?.name,
      fullName: row.fullName,
      jobTitle: row.jobTitle,
      siteId: row.siteId,
      siteName: row.site?.name ?? null,
      notes: row.notes,
      erasedAt: row.erasedAt?.toISOString() ?? null,
      certificateStatus: latestItem?.status ?? null,
      nextRenewalAt: latestItem?.nextRenewalAt ?? null,
      latestCertificate: latestItem,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findPage(
    user: AuthRequestUser,
    query: ClientEmployeeListQuery,
  ): Promise<ClientEmployeePage> {
    this.assertOfficeRead(user);
    const asOf = todayInSofia(new Date());

    const where: Prisma.ClientEmployeeWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.siteId) where.siteId = query.siteId;
    if (!query.includeErased) where.erasedAt = null;

    const [total, rows] = await Promise.all([
      this.prisma.clientEmployee.count({ where }),
      this.prisma.clientEmployee.findMany({
        where,
        include: {
          client: { select: { name: true } },
          site: { select: { name: true } },
          certificates: { orderBy: { nextRenewalAt: "desc" } },
        },
        orderBy: [{ fullName: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    let items = rows.map((row) => this.toItem(row, asOf));

    if (query.status) {
      items = items.filter((item) => item.certificateStatus === query.status);
    }
    if (query.expiringWithin !== undefined) {
      const days = query.expiringWithin;
      items = items.filter(
        (item) =>
          item.nextRenewalAt != null &&
          expiresWithin({
            nextRenewalAt: item.nextRenewalAt,
            asOf,
            days,
          }),
      );
    }

    await auditReadPii(this.audit, {
      table: "client_employees",
      entityIds: items.map((i) => i.id),
      actorUserId: user.id,
    });

    return {
      items,
      total: query.status || query.expiringWithin !== undefined ? items.length : total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<ClientEmployeeItem> {
    this.assertOfficeRead(user);
    const asOf = todayInSofia(new Date());
    const row = await this.prisma.clientEmployee.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
        certificates: { orderBy: { nextRenewalAt: "desc" } },
      },
    });
    if (!row) {
      throw new AppException(
        ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND,
        "Client employee not found",
      );
    }
    await auditReadPii(this.audit, {
      table: "client_employees",
      entityIds: [row.id],
      actorUserId: user.id,
    });
    return this.toItem(row, asOf);
  }

  async create(
    user: AuthRequestUser,
    body: ClientEmployeeCreateBody,
  ): Promise<ClientEmployeeItem> {
    this.assertWrite(user);
    const asOf = todayInSofia(new Date());
    const client = await this.prisma.client.findUnique({
      where: { id: body.clientId },
    });
    if (!client) {
      throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
    }
    if (body.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
      if (!site || site.clientId !== body.clientId) {
        throw new AppException(ErrorCode.NOT_FOUND, "Site not found for client");
      }
    }
    const row = await this.prisma.clientEmployee.create({
      data: {
        id: createId(),
        clientId: body.clientId,
        fullName: body.fullName,
        jobTitle: body.jobTitle ?? null,
        siteId: body.siteId ?? null,
        notes: body.notes ?? null,
        createdById: user.id,
      },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
        certificates: true,
      },
    });
    return this.toItem(row, asOf);
  }

  async update(
    user: AuthRequestUser,
    id: string,
    body: ClientEmployeeUpdateBody,
  ): Promise<ClientEmployeeItem> {
    this.assertWrite(user);
    const asOf = todayInSofia(new Date());
    const existing = await this.prisma.clientEmployee.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(
        ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND,
        "Client employee not found",
      );
    }
    if (existing.erasedAt) {
      throw new AppException(
        ErrorCode.CONFLICT,
        "Erased employee cannot be updated",
      );
    }
    if (body.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
      if (!site || site.clientId !== existing.clientId) {
        throw new AppException(ErrorCode.NOT_FOUND, "Site not found for client");
      }
    }
    const row = await this.prisma.clientEmployee.update({
      where: { id },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.jobTitle !== undefined ? { jobTitle: body.jobTitle } : {}),
        ...(body.siteId !== undefined ? { siteId: body.siteId } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
        certificates: { orderBy: { nextRenewalAt: "desc" } },
      },
    });
    return this.toItem(row, asOf);
  }

  async erase(
    user: AuthRequestUser,
    id: string,
    body: EraseRequestBody,
  ): Promise<ClientEmployeeItem> {
    if (user.role !== Role.ADMIN) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 3) {
      throw new AppException(
        ErrorCode.ERASE_REASON_REQUIRED,
        "Erase reason is required (min 3 characters)",
      );
    }

    const asOf = todayInSofia(new Date());
    const existing = await this.prisma.clientEmployee.findUnique({
      where: { id },
      include: { certificates: true },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND,
        "Client employee not found",
      );
    }
    if (existing.erasedAt) {
      throw new AppException(ErrorCode.CONFLICT, "Already erased");
    }

    // Collect document files to delete after the anonymizing UPDATE succeeds.
    const fileIds = existing.certificates
      .map((c) => c.documentFileId)
      .filter((fid): fid is string => fid != null);

    const files =
      fileIds.length === 0
        ? []
        : await this.prisma.storedFile.findMany({
            where: { id: { in: fileIds } },
          });

    const row = await this.prisma.transaction(async (tx) => {
      // Null document refs first so stored_files can be removed.
      await tx.healthCertificate.updateMany({
        where: { clientEmployeeId: id, documentFileId: { not: null } },
        data: { documentFileId: null },
      });

      const updated = await tx.clientEmployee.update({
        where: { id },
        data: {
          fullName: "[изтрито]",
          jobTitle: existing.jobTitle == null ? null : "[изтрито]",
          notes: null,
          erasedAt: new Date(),
          erasedById: user.id,
          eraseReason: reason,
        },
        include: {
          client: { select: { name: true } },
          site: { select: { name: true } },
          certificates: { orderBy: { nextRenewalAt: "desc" } },
        },
      });

      for (const file of files) {
        await tx.storedFile.delete({ where: { id: file.id } }).catch(() => {
          // stored_files may lack no-delete trigger; ignore if already gone
        });
      }

      return updated;
    });

    // Best-effort S3 delete after DB commit. Ordering: anonymize first so a
    // storage failure does not leave a partial erasure that fails the CHECK.
    for (const file of files) {
      try {
        await this.storage.delete(file.storageKey);
      } catch {
        // Storage miss is non-fatal after DB anonymization.
      }
    }

    await this.audit.log({
      action: AuditSecurityAction.ERASED,
      entityType: "client_employees",
      entityId: id,
      actorUserId: user.id,
      meta: { reason },
    });

    return this.toItem(row, asOf);
  }

  async export(user: AuthRequestUser, id: string): Promise<ClientEmployeeExport> {
    const ability = this.abilityFor(user);
    if (
      !ability.can("export", "ClientEmployee") &&
      !ability.can("manage", "all")
    ) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
    const asOf = todayInSofia(new Date());
    const row = await this.prisma.clientEmployee.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
        certificates: { orderBy: { nextRenewalAt: "desc" } },
      },
    });
    if (!row) {
      throw new AppException(
        ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND,
        "Client employee not found",
      );
    }

    await auditReadPii(this.audit, {
      table: "client_employees",
      entityIds: [row.id],
      actorUserId: user.id,
    });
    if (row.certificates.length > 0) {
      await auditReadPii(this.audit, {
        table: "health_certificates",
        entityIds: row.certificates.map((c) => c.id),
        actorUserId: user.id,
      });
    }

    await this.audit.log({
      action: AuditSecurityAction.EXPORT,
      entityType: "client_employees",
      entityId: id,
      actorUserId: user.id,
    });

    // No food sample records linked to employees in P10 (no sampler FK).
    return {
      employee: this.toItem(row, asOf),
      certificates: row.certificates.map((c) => this.toCertificateItem(c, asOf)),
      exportedAt: new Date().toISOString(),
    };
  }

  /** Used by certificates service for mapping. */
  toCertificateItemPublic(
    row: HealthCertificate,
    asOf: string,
  ): HealthCertificateItem {
    return this.toCertificateItem(row, asOf);
  }
}

// Keep isoDateToDate available for sibling services via re-export if needed.
void isoDateToDate;
