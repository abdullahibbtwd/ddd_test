import { AuditLogPageSchema, AuditLogQuerySchema } from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class AuditLogQueryDto extends createZodDto(AuditLogQuerySchema) {}
export class AuditLogPageDto extends createZodDto(AuditLogPageSchema) {}
