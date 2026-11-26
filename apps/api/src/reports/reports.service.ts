import {
  defineAbilityFor,
  ErrorCode,
  ReportExportFormat,
  ReportKind,
  ReportKindSchema,
  ReportCashExportQuerySchema,
  ReportCashQuerySchema,
  ReportExpirationsExportQuerySchema,
  ReportExpirationsQuerySchema,
  ReportOutstandingExportQuerySchema,
  ReportOutstandingQuerySchema,
  ReportProductsExportQuerySchema,
  ReportProductsQuerySchema,
  ReportRevenueExportQuerySchema,
  ReportRevenueQuerySchema,
  ReportServiceCoverageExportQuerySchema,
  ReportServiceCoverageQuerySchema,
  type ReportKind as ReportKindT,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsExportService } from "./reports-export.service";
import { ReportsQueryService } from "./reports-query.service";

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportsQueryService) private readonly queries: ReportsQueryService,
    @Inject(ReportsExportService) private readonly exports: ReportsExportService,
  ) {}

  private assertCanRead(user: AuthRequestUser): void {
    const ability = defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
    if (!ability.can("read", "Report")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Нямате достъп до справки.");
    }
  }

  parseKind(raw: string): ReportKindT {
    const upper = raw.trim().toUpperCase().replace(/-/g, "_");
    const parsed = ReportKindSchema.safeParse(upper);
    if (!parsed.success) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        "Справката не беше намерена.",
      );
    }
    return parsed.data;
  }

  parseFormat(raw: unknown): (typeof ReportExportFormat)[keyof typeof ReportExportFormat] {
    if (typeof raw !== "string") {
      throw new AppException(
        ErrorCode.INVALID_EXPORT_FORMAT,
        "Невалиден формат за експорт. Използвайте excel или pdf.",
      );
    }
    const v = raw.trim().toLowerCase();
    if (v === "excel") return ReportExportFormat.EXCEL;
    if (v === "pdf") return ReportExportFormat.PDF;
    throw new AppException(
      ErrorCode.INVALID_EXPORT_FORMAT,
      "Невалиден формат за експорт. Използвайте excel или pdf.",
    );
  }

  private async assertFilterIds(
    filter: Record<string, unknown>,
  ): Promise<void> {
    const fail = (msg: string) => {
      throw new AppException(ErrorCode.REPORT_FILTER_INVALID, msg);
    };
    if (typeof filter.areaId === "string") {
      const a = await this.prisma.area.findUnique({
        where: { id: filter.areaId },
        select: { id: true },
      });
      if (!a) fail("Невалиден район във филтъра.");
    }
    if (typeof filter.employeeId === "string") {
      const u = await this.prisma.user.findUnique({
        where: { id: filter.employeeId },
        select: { id: true },
      });
      if (!u) fail("Невалиден служител във филтъра.");
    }
    if (typeof filter.clientId === "string") {
      const c = await this.prisma.client.findUnique({
        where: { id: filter.clientId },
        select: { id: true },
      });
      if (!c) fail("Невалиден клиент във филтъра.");
    }
    if (typeof filter.siteId === "string") {
      const s = await this.prisma.site.findUnique({
        where: { id: filter.siteId },
        select: { id: true },
      });
      if (!s) fail("Невалиден обект във филтъра.");
    }
  }

  private parseQuery(kind: ReportKindT, query: Record<string, unknown>) {
    const schemas = {
      [ReportKind.REVENUE]: ReportRevenueQuerySchema,
      [ReportKind.SERVICE_COVERAGE]: ReportServiceCoverageQuerySchema,
      [ReportKind.OUTSTANDING]: ReportOutstandingQuerySchema,
      [ReportKind.CASH]: ReportCashQuerySchema,
      [ReportKind.EXPIRATIONS]: ReportExpirationsQuerySchema,
      [ReportKind.PRODUCTS]: ReportProductsQuerySchema,
    } as const;
    const parsed = schemas[kind].safeParse(query);
    if (!parsed.success) {
      throw new AppException(
        ErrorCode.REPORT_FILTER_INVALID,
        "Невалидни филтри за справката (проверете периода и избраните стойности).",
        parsed.error.flatten(),
      );
    }
    return parsed.data;
  }

  private parseExportQuery(kind: ReportKindT, query: Record<string, unknown>) {
    const format = this.parseFormat(query.format);
    const schemas = {
      [ReportKind.REVENUE]: ReportRevenueExportQuerySchema,
      [ReportKind.SERVICE_COVERAGE]: ReportServiceCoverageExportQuerySchema,
      [ReportKind.OUTSTANDING]: ReportOutstandingExportQuerySchema,
      [ReportKind.CASH]: ReportCashExportQuerySchema,
      [ReportKind.EXPIRATIONS]: ReportExpirationsExportQuerySchema,
      [ReportKind.PRODUCTS]: ReportProductsExportQuerySchema,
    } as const;
    const parsed = schemas[kind].safeParse({ ...query, format });
    if (!parsed.success) {
      throw new AppException(
        ErrorCode.REPORT_FILTER_INVALID,
        "Невалидни филтри за справката (проверете периода и избраните стойности).",
        parsed.error.flatten(),
      );
    }
    return parsed.data;
  }

  async list(
    user: AuthRequestUser,
    kindRaw: string,
    query: Record<string, unknown>,
  ) {
    this.assertCanRead(user);
    const kind = this.parseKind(kindRaw);
    const filter = this.parseQuery(kind, query);
    await this.assertFilterIds(filter as Record<string, unknown>);

    switch (kind) {
      case ReportKind.REVENUE:
        return this.queries.revenue(filter as never, user.id);
      case ReportKind.SERVICE_COVERAGE:
        return this.queries.serviceCoverage(filter as never);
      case ReportKind.OUTSTANDING:
        return this.queries.outstanding(filter as never);
      case ReportKind.CASH:
        return this.queries.cash(filter as never);
      case ReportKind.EXPIRATIONS:
        return this.queries.expirations(filter as never, user.id);
      case ReportKind.PRODUCTS:
        return this.queries.products(filter as never);
      default:
        throw new AppException(ErrorCode.NOT_FOUND, "Справката не беше намерена.");
    }
  }

  async export(
    user: AuthRequestUser,
    kindRaw: string,
    query: Record<string, unknown>,
    reply: FastifyReply,
  ): Promise<void> {
    this.assertCanRead(user);
    const kind = this.parseKind(kindRaw);
    const filter = this.parseExportQuery(kind, query);
    await this.assertFilterIds(filter as Record<string, unknown>);
    const { format, ...rest } = filter as { format: typeof ReportExportFormat.EXCEL } & Record<
      string,
      unknown
    >;
    await this.exports.export(kind, format, rest, user.id, reply);
  }
}
