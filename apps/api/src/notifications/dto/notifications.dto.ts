import {
  NotificationDismissResultSchema,
  NotificationItemSchema,
  NotificationListQuerySchema,
  NotificationMarkReadResultSchema,
  NotificationPageSchema,
  NotificationReadAllResultSchema,
  NotificationSummaryQuerySchema,
  NotificationSummarySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class NotificationListQueryDto extends createZodDto(NotificationListQuerySchema) {}
export class NotificationPageDto extends createZodDto(NotificationPageSchema) {}
export class NotificationItemDto extends createZodDto(NotificationItemSchema) {}
export class NotificationMarkReadResultDto extends createZodDto(NotificationMarkReadResultSchema) {}
export class NotificationDismissResultDto extends createZodDto(NotificationDismissResultSchema) {}
export class NotificationReadAllResultDto extends createZodDto(NotificationReadAllResultSchema) {}
export class NotificationSummaryQueryDto extends createZodDto(NotificationSummaryQuerySchema) {}
export class NotificationSummaryDto extends createZodDto(NotificationSummarySchema) {}
