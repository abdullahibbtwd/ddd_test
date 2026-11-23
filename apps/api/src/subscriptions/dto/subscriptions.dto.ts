import {
  CreateSubscriptionBodySchema,
  SubscriptionItemSchema,
  SubscriptionListQuerySchema,
  SubscriptionPageSchema,
  UpdateSubscriptionBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class SubscriptionListQueryDto extends createZodDto(SubscriptionListQuerySchema) {}
export class SubscriptionItemDto extends createZodDto(SubscriptionItemSchema) {}
export class SubscriptionPageDto extends createZodDto(SubscriptionPageSchema) {}
export class CreateSubscriptionBodyDto extends createZodDto(CreateSubscriptionBodySchema) {}
export class UpdateSubscriptionBodyDto extends createZodDto(UpdateSubscriptionBodySchema) {}
