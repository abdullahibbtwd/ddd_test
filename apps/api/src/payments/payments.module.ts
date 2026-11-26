import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import {
  CashHandoversController,
  CashLedgerController,
  InvoicePaymentsController,
  VisitPaymentsController,
} from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [QueueModule],
  controllers: [
    InvoicePaymentsController,
    VisitPaymentsController,
    CashHandoversController,
    CashLedgerController,
  ],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
