import {
  AgreementCreateBodySchema,
  AgreementExpiringQuerySchema,
  AgreementItemSchema,
  AgreementListQuerySchema,
  AgreementPageSchema,
  AgreementRenewBodySchema,
  AgreementUpdateBodySchema,
  CertificateCreateBodySchema,
  CertificateExpiringQuerySchema,
  CertificateUpdateBodySchema,
  CertifiedEmployeesQuerySchema,
  CertifiedEmployeesResponseSchema,
  ClientEmployeeCreateBodySchema,
  ClientEmployeeExportSchema,
  ClientEmployeeItemSchema,
  ClientEmployeeListQuerySchema,
  ClientEmployeePageSchema,
  ClientEmployeeUpdateBodySchema,
  EraseRequestBodySchema,
  FoodRecordCreateBodySchema,
  FoodRecordItemSchema,
  FoodRecordListQuerySchema,
  FoodRecordPageSchema,
  FoodRecordUpdateBodySchema,
  FoodScheduleCreateBodySchema,
  FoodScheduleDueQuerySchema,
  FoodScheduleItemSchema,
  FoodScheduleListQuerySchema,
  FoodSchedulePageSchema,
  FoodScheduleUpdateBodySchema,
  HealthCertificateItemSchema,
  HealthCertificatePageSchema,
  SiteCertificateCountsSchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class ClientEmployeeListQueryDto extends createZodDto(
  ClientEmployeeListQuerySchema,
) {}
export class ClientEmployeeItemDto extends createZodDto(ClientEmployeeItemSchema) {}
export class ClientEmployeePageDto extends createZodDto(ClientEmployeePageSchema) {}
export class ClientEmployeeCreateBodyDto extends createZodDto(
  ClientEmployeeCreateBodySchema,
) {}
export class ClientEmployeeUpdateBodyDto extends createZodDto(
  ClientEmployeeUpdateBodySchema,
) {}
export class ClientEmployeeExportDto extends createZodDto(ClientEmployeeExportSchema) {}
export class EraseRequestBodyDto extends createZodDto(EraseRequestBodySchema) {}

export class CertificateCreateBodyDto extends createZodDto(CertificateCreateBodySchema) {}
export class CertificateUpdateBodyDto extends createZodDto(CertificateUpdateBodySchema) {}
export class CertificateExpiringQueryDto extends createZodDto(
  CertificateExpiringQuerySchema,
) {}
export class HealthCertificateItemDto extends createZodDto(HealthCertificateItemSchema) {}
export class HealthCertificatePageDto extends createZodDto(HealthCertificatePageSchema) {}

export class AgreementListQueryDto extends createZodDto(AgreementListQuerySchema) {}
export class AgreementExpiringQueryDto extends createZodDto(
  AgreementExpiringQuerySchema,
) {}
export class AgreementItemDto extends createZodDto(AgreementItemSchema) {}
export class AgreementPageDto extends createZodDto(AgreementPageSchema) {}
export class AgreementCreateBodyDto extends createZodDto(AgreementCreateBodySchema) {}
export class AgreementUpdateBodyDto extends createZodDto(AgreementUpdateBodySchema) {}
export class AgreementRenewBodyDto extends createZodDto(AgreementRenewBodySchema) {}

export class FoodScheduleListQueryDto extends createZodDto(FoodScheduleListQuerySchema) {}
export class FoodScheduleDueQueryDto extends createZodDto(FoodScheduleDueQuerySchema) {}
export class FoodScheduleItemDto extends createZodDto(FoodScheduleItemSchema) {}
export class FoodSchedulePageDto extends createZodDto(FoodSchedulePageSchema) {}
export class FoodScheduleCreateBodyDto extends createZodDto(
  FoodScheduleCreateBodySchema,
) {}
export class FoodScheduleUpdateBodyDto extends createZodDto(
  FoodScheduleUpdateBodySchema,
) {}

export class FoodRecordListQueryDto extends createZodDto(FoodRecordListQuerySchema) {}
export class FoodRecordItemDto extends createZodDto(FoodRecordItemSchema) {}
export class FoodRecordPageDto extends createZodDto(FoodRecordPageSchema) {}
export class FoodRecordCreateBodyDto extends createZodDto(FoodRecordCreateBodySchema) {}
export class FoodRecordUpdateBodyDto extends createZodDto(FoodRecordUpdateBodySchema) {}

export class CertifiedEmployeesQueryDto extends createZodDto(
  CertifiedEmployeesQuerySchema,
) {}
export class CertifiedEmployeesResponseDto extends createZodDto(
  CertifiedEmployeesResponseSchema,
) {}
export class SiteCertificateCountsDto extends createZodDto(SiteCertificateCountsSchema) {}
