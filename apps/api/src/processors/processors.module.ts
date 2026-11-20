import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { QueueModule } from "../queue/queue.module";
import { StorageModule } from "../storage/storage.module";
import { DefaultProcessor } from "./default.processor";
import { EmailProcessor } from "./email.processor";
import { RegisterRepeatableJobs } from "./register-repeatable-jobs";

@Module({
  imports: [QueueModule, MailModule, StorageModule],
  providers: [DefaultProcessor, EmailProcessor, RegisterRepeatableJobs],
})
export class ProcessorsModule {}
