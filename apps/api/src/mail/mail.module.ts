import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import { MailQueueService } from "./mail-queue.service";
import { MAIL_SERVICE } from "./mail.types";
import { SmtpMailService } from "./smtp-mail.service";

@Module({
  imports: [QueueModule],
  providers: [
    SmtpMailService,
    {
      provide: MAIL_SERVICE,
      useExisting: SmtpMailService,
    },
    MailQueueService,
  ],
  exports: [MAIL_SERVICE, SmtpMailService, MailQueueService],
})
export class MailModule {}
