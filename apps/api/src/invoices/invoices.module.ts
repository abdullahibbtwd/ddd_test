import { Module } from "@nestjs/common";
import { PdfModule } from "../pdf/pdf.module";
import { QueueModule } from "../queue/queue.module";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesDocumentsService } from "./invoices-documents.service";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [QueueModule, PdfModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesDocumentsService, InvoicePdfService],
  exports: [InvoicesService, InvoicesDocumentsService, InvoicePdfService],
})
export class InvoicesModule {}
