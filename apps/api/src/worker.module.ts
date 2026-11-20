import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { AppConfigModule } from "./config/config.module";
import { AppConfigService } from "./config/config.service";
import { MailModule } from "./mail/mail.module";
import { PdfModule } from "./pdf/pdf.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProcessorsModule } from "./processors/processors.module";
import { QueueModule } from "./queue/queue.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? "info" : "debug",
          transport: config.isProduction
            ? undefined
            : {
                target: "pino-pretty",
                options: { singleLine: true, colorize: true },
              },
          redact: {
            paths: ["*.password", "password"],
            censor: "[Redacted]",
          },
        },
      }),
    }),
    PrismaModule,
    QueueModule,
    StorageModule,
    PdfModule,
    MailModule,
    ProcessorsModule,
  ],
})
export class WorkerModule {}
