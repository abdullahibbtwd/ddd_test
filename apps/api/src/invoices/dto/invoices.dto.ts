import {
  BatchCreateBodySchema,
  BatchCreateResultSchema,
  BatchIssueBodySchema,
  BatchIssueResultSchema,
  CreateInvoiceBodySchema,
  CreditNoteCreateBodySchema,
  DebitNoteCreateBodySchema,
  EmailEnqueueResultSchema,
  EmailEventListSchema,
  EmailSendBodySchema,
  InvoiceItemSchema,
  InvoiceListQuerySchema,
  InvoicePageSchema,
  UpdateInvoiceDraftBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class InvoiceListQueryDto extends createZodDto(InvoiceListQuerySchema) {}
export class InvoiceItemDto extends createZodDto(InvoiceItemSchema) {}
export class InvoicePageDto extends createZodDto(InvoicePageSchema) {}
export class CreateInvoiceBodyDto extends createZodDto(CreateInvoiceBodySchema) {}
export class UpdateInvoiceDraftBodyDto extends createZodDto(
  UpdateInvoiceDraftBodySchema,
) {}
export class CreditNoteCreateBodyDto extends createZodDto(CreditNoteCreateBodySchema) {}
export class DebitNoteCreateBodyDto extends createZodDto(DebitNoteCreateBodySchema) {}
export class EmailSendBodyDto extends createZodDto(EmailSendBodySchema) {}
export class EmailEnqueueResultDto extends createZodDto(EmailEnqueueResultSchema) {}
export class EmailEventListDto extends createZodDto(EmailEventListSchema) {}
export class BatchCreateBodyDto extends createZodDto(BatchCreateBodySchema) {}
export class BatchCreateResultDto extends createZodDto(BatchCreateResultSchema) {}
export class BatchIssueBodyDto extends createZodDto(BatchIssueBodySchema) {}
export class BatchIssueResultDto extends createZodDto(BatchIssueResultSchema) {}
