import { Module } from "@nestjs/common";
import { loadEnvFiles } from "../config/load-env";
import { MailModule } from "../mail/mail.module";
import { PdfModule } from "../pdf/pdf.module";
import { QueueModule } from "../queue/queue.module";
import { StorageModule } from "../storage/storage.module";
import { MailSmokeController } from "./mail-smoke.controller";
import { PdfSmokeController } from "./pdf-smoke.controller";
import { PingJobController } from "./ping-job.controller";

loadEnvFiles();

// Smoke controllers are available outside production (dev + test).
const enableDevControllers = process.env.NODE_ENV !== "production";

@Module({
  imports: [QueueModule, StorageModule, PdfModule, MailModule],
  controllers: enableDevControllers
    ? [PingJobController, PdfSmokeController, MailSmokeController]
    : [],
})
export class DevModule {}
