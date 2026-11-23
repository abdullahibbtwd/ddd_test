import {
  MonthDaysQuerySchema,
  MonthDaysResponseSchema,
  MonthListQuerySchema,
  MonthResponseSchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class MonthListQueryDto extends createZodDto(MonthListQuerySchema) {}
export class MonthResponseDto extends createZodDto(MonthResponseSchema) {}
export class MonthDaysQueryDto extends createZodDto(MonthDaysQuerySchema) {}
export class MonthDaysResponseDto extends createZodDto(MonthDaysResponseSchema) {}
