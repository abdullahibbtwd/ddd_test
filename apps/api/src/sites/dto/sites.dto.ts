import {
  CreateSiteBodySchema,
  SiteDuplicatesQuerySchema,
  SiteDuplicatesResponseSchema,
  SiteItemSchema,
  SiteListQuerySchema,
  SiteMapQuerySchema,
  SiteMapResponseSchema,
  SitePageSchema,
  UpdateSiteBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class SiteListQueryDto extends createZodDto(SiteListQuerySchema) {}
export class SiteMapQueryDto extends createZodDto(SiteMapQuerySchema) {}
export class SitePageDto extends createZodDto(SitePageSchema) {}
export class SiteMapResponseDto extends createZodDto(SiteMapResponseSchema) {}
export class SiteItemDto extends createZodDto(SiteItemSchema) {}
export class SiteDuplicatesQueryDto extends createZodDto(SiteDuplicatesQuerySchema) {}
export class SiteDuplicatesResponseDto extends createZodDto(SiteDuplicatesResponseSchema) {}
export class CreateSiteBodyDto extends createZodDto(CreateSiteBodySchema) {}
export class UpdateSiteBodyDto extends createZodDto(UpdateSiteBodySchema) {}
