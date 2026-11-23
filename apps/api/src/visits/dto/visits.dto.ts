import {
  CancelVisitBodySchema,
  CreateVisitBodySchema,
  UpdateVisitBodySchema,
  VisitItemSchema,
  VisitListQuerySchema,
  VisitPageSchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class VisitListQueryDto extends createZodDto(VisitListQuerySchema) {}
export class VisitItemDto extends createZodDto(VisitItemSchema) {}
export class VisitPageDto extends createZodDto(VisitPageSchema) {}
export class CreateVisitBodyDto extends createZodDto(CreateVisitBodySchema) {}
export class UpdateVisitBodyDto extends createZodDto(UpdateVisitBodySchema) {}
export class CancelVisitBodyDto extends createZodDto(CancelVisitBodySchema) {}
