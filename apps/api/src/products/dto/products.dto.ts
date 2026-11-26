import {
  MonitoringPointCheckBatchBodySchema,
  MonitoringPointCheckCreateBodySchema,
  MonitoringPointCheckItemSchema,
  MonitoringPointCheckListSchema,
  MonitoringPointCheckUpdateBodySchema,
  MonitoringPointCreateBodySchema,
  MonitoringPointItemSchema,
  MonitoringPointListQuerySchema,
  MonitoringPointPageSchema,
  MonitoringPointReconcileBodySchema,
  MonitoringPointReconcileResultSchema,
  MonitoringPointUpdateBodySchema,
  ProductCreateBodySchema,
  ProductItemSchema,
  ProductListQuerySchema,
  ProductPageSchema,
  ProductUpdateBodySchema,
  ServiceReportQuerySchema,
  VisitProductCreateBodySchema,
  VisitProductItemSchema,
  VisitProductListSchema,
  VisitProductUpdateBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class ProductListQueryDto extends createZodDto(ProductListQuerySchema) {}
export class ProductItemDto extends createZodDto(ProductItemSchema) {}
export class ProductPageDto extends createZodDto(ProductPageSchema) {}
export class ProductCreateBodyDto extends createZodDto(ProductCreateBodySchema) {}
export class ProductUpdateBodyDto extends createZodDto(ProductUpdateBodySchema) {}

export class VisitProductCreateBodyDto extends createZodDto(VisitProductCreateBodySchema) {}
export class VisitProductUpdateBodyDto extends createZodDto(VisitProductUpdateBodySchema) {}
export class VisitProductItemDto extends createZodDto(VisitProductItemSchema) {}
export class VisitProductListDto extends createZodDto(VisitProductListSchema) {}

export class MonitoringPointCreateBodyDto extends createZodDto(
  MonitoringPointCreateBodySchema,
) {}
export class MonitoringPointUpdateBodyDto extends createZodDto(
  MonitoringPointUpdateBodySchema,
) {}
export class MonitoringPointReconcileBodyDto extends createZodDto(
  MonitoringPointReconcileBodySchema,
) {}
export class MonitoringPointListQueryDto extends createZodDto(
  MonitoringPointListQuerySchema,
) {}
export class MonitoringPointItemDto extends createZodDto(MonitoringPointItemSchema) {}
export class MonitoringPointPageDto extends createZodDto(MonitoringPointPageSchema) {}
export class MonitoringPointReconcileResultDto extends createZodDto(
  MonitoringPointReconcileResultSchema,
) {}

export class MonitoringPointCheckCreateBodyDto extends createZodDto(
  MonitoringPointCheckCreateBodySchema,
) {}
export class MonitoringPointCheckUpdateBodyDto extends createZodDto(
  MonitoringPointCheckUpdateBodySchema,
) {}
export class MonitoringPointCheckBatchBodyDto extends createZodDto(
  MonitoringPointCheckBatchBodySchema,
) {}
export class MonitoringPointCheckItemDto extends createZodDto(
  MonitoringPointCheckItemSchema,
) {}
export class MonitoringPointCheckListDto extends createZodDto(
  MonitoringPointCheckListSchema,
) {}

export class ServiceReportQueryDto extends createZodDto(ServiceReportQuerySchema) {}
