import {
  AreaItemSchema,
  AreaListQuerySchema,
  AreaPageSchema,
  CreateAreaBodySchema,
  UpdateAreaBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class AreaListQueryDto extends createZodDto(AreaListQuerySchema) {}
export class AreaItemDto extends createZodDto(AreaItemSchema) {}
export class AreaPageDto extends createZodDto(AreaPageSchema) {}
export class CreateAreaBodyDto extends createZodDto(CreateAreaBodySchema) {}
export class UpdateAreaBodyDto extends createZodDto(UpdateAreaBodySchema) {}
