import {
  ReportCashExportQuerySchema,
  ReportCashQuerySchema,
  ReportExpirationsExportQuerySchema,
  ReportExpirationsQuerySchema,
  ReportKindSchema,
  ReportOutstandingExportQuerySchema,
  ReportOutstandingQuerySchema,
  ReportProductsExportQuerySchema,
  ReportProductsQuerySchema,
  ReportRevenueExportQuerySchema,
  ReportRevenueQuerySchema,
  ReportServiceCoverageExportQuerySchema,
  ReportServiceCoverageQuerySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ReportKindParamDto extends createZodDto(
  z.object({ kind: ReportKindSchema }),
) {}

export class ReportRevenueQueryDto extends createZodDto(ReportRevenueQuerySchema) {}
export class ReportRevenueExportQueryDto extends createZodDto(
  ReportRevenueExportQuerySchema,
) {}

export class ReportServiceCoverageQueryDto extends createZodDto(
  ReportServiceCoverageQuerySchema,
) {}
export class ReportServiceCoverageExportQueryDto extends createZodDto(
  ReportServiceCoverageExportQuerySchema,
) {}

export class ReportOutstandingQueryDto extends createZodDto(
  ReportOutstandingQuerySchema,
) {}
export class ReportOutstandingExportQueryDto extends createZodDto(
  ReportOutstandingExportQuerySchema,
) {}

export class ReportCashQueryDto extends createZodDto(ReportCashQuerySchema) {}
export class ReportCashExportQueryDto extends createZodDto(
  ReportCashExportQuerySchema,
) {}

export class ReportExpirationsQueryDto extends createZodDto(
  ReportExpirationsQuerySchema,
) {}
export class ReportExpirationsExportQueryDto extends createZodDto(
  ReportExpirationsExportQuerySchema,
) {}

export class ReportProductsQueryDto extends createZodDto(ReportProductsQuerySchema) {}
export class ReportProductsExportQueryDto extends createZodDto(
  ReportProductsExportQuerySchema,
) {}
