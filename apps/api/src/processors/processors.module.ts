import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { QueueModule } from "../queue/queue.module";
import { StorageModule } from "../storage/storage.module";
import { DefaultProcessor } from "./default.processor";
import { EmailProcessor } from "./email.processor";
import { InvoiceEmailProcessor } from "./invoice-email.processor";
import { NotificationProcessor } from "./notification.processor";
import { PaymentReminderProcessor } from "./payment-reminder.processor";
import { RegisterRepeatableJobs } from "./register-repeatable-jobs";

@Module({
  imports: [
    QueueModule,
    MailModule,
    StorageModule,
    InvoicesModule,
    PaymentsModule,
    NotificationsModule,
  ],
  providers: [
    DefaultProcessor,
    EmailProcessor,
    InvoiceEmailProcessor,
    PaymentReminderProcessor,
    NotificationProcessor,
    RegisterRepeatableJobs,
  ],
})
export class ProcessorsModule {}