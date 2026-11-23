import {
  CreateSiteTypeBodySchema,
  SiteTypeItemSchema,
  SiteTypeListQuerySchema,
  SiteTypeListResponseSchema,
  UpdateSiteTypeBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class SiteTypeListQueryDto extends createZodDto(SiteTypeListQuerySchema) {}
export class SiteTypeItemDto extends createZodDto(SiteTypeItemSchema) {}
export class SiteTypeListResponseDto extends createZodDto(SiteTypeListResponseSchema) {}
export class CreateSiteTypeBodyDto extends createZodDto(CreateSiteTypeBodySchema) {}
export class UpdateSiteTypeBodyDto extends createZodDto(UpdateSiteTypeBodySchema) {}
