import {
  CashLedgerQuerySchema,
  CashLedgerResponseSchema,
  HandoverCreateBodySchema,
  HandoverCreateResultSchema,
  OutstandingPageSchema,
  OutstandingQuerySchema,
  PaymentCreateFieldBodySchema,
  PaymentCreateOfficeBodySchema,
  PaymentListSchema,
  ReminderSendBodySchema,
  EmailEnqueueResultSchema,
  EmailEventListSchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class PaymentCreateOfficeBodyDto extends createZodDto(
  PaymentCreateOfficeBodySchema,
) {}
export class PaymentCreateFieldBodyDto extends createZodDto(
  PaymentCreateFieldBodySchema,
) {}
export class PaymentListDto extends createZodDto(PaymentListSchema) {}
export class HandoverCreateBodyDto extends createZodDto(HandoverCreateBodySchema) {}
export class HandoverCreateResultDto extends createZodDto(HandoverCreateResultSchema) {}
export class OutstandingQueryDto extends createZodDto(OutstandingQuerySchema) {}
export class OutstandingPageDto extends createZodDto(OutstandingPageSchema) {}
export class CashLedgerQueryDto extends createZodDto(CashLedgerQuerySchema) {}
export class CashLedgerResponseDto extends createZodDto(CashLedgerResponseSchema) {}
export class ReminderSendBodyDto extends createZodDto(ReminderSendBodySchema) {}
export class ReminderEnqueueResultDto extends createZodDto(EmailEnqueueResultSchema) {}
export class ReminderEventListDto extends createZodDto(EmailEventListSchema) {}
