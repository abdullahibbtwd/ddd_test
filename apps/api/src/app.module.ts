import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import { AreasModule } from "./areas/areas.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ClientsModule } from "./clients/clients.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { OriginGuard } from "./auth/guards/origin.guard";
import { PoliciesGuard } from "./auth/guards/policies.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AppConfigModule } from "./config/config.module";
import { AppConfigService } from "./config/config.service";
import { DevModule } from "./dev/dev.module";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./mail/mail.module";
import { PdfModule } from "./pdf/pdf.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { SiteTypesModule } from "./site-types/site-types.module";
import { SitesModule } from "./sites/sites.module";
import { StorageModule } from "./storage/storage.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { UsersModule } from "./users/users.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PaymentsModule } from "./payments/payments.module";
import { ProductsModule } from "./products/products.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ReportsModule } from "./reports/reports.module";
import { VisitsModule } from "./visits/visits.module";

/** Paths redacted from structured logs (never log secrets / credentials). */
export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers[\"set-cookie\"]",
  "req.headers[\"set-cookie\"]",
  "*.password",
  "password",
  "*.currentPassword",
  "currentPassword",
  "*.newPassword",
  "newPassword",
  "*.temporaryPassword",
  "temporaryPassword",
  "*.token",
  "token",
  "*.access_token",
  "access_token",
  "*.refresh_token",
  "refresh_token",
  "JWT_ACCESS_SECRET",
  "*.JWT_ACCESS_SECRET",
] as const;

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? "info" : "debug",
          // Fastify already assigns req.id via requestIdHeader / genReqId.
          genReqId: (req) => req.id,
          transport: config.isProduction
            ? undefined
            : {
                target: "pino-pretty",
                options: { singleLine: true, colorize: true },
              },
          redact: {
            paths: [...LOGGER_REDACT_PATHS],
            censor: "[Redacted]",
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: 60_000,
          limit: 100,
          // Vitest shares one app + IP; Playwright sets E2E=1 on the API process
          // so login (10/min) does not flake across projects.
          skipIf: () => config.isTest || process.env.E2E === "1",
        },
      ],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    AreasModule,
    ClientsModule,
    SiteTypesModule,
    ProductsModule,
    ComplianceModule,
    NotificationsModule,
    ReportsModule,
    SitesModule,
    SubscriptionsModule,
    SchedulingModule,
    VisitsModule,
    InvoicesModule,
    PaymentsModule,
    UsersModule,
    QueueModule,
    StorageModule,
    PdfModule,
    MailModule,
    HealthModule,
    DevModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PoliciesGuard,
    },
  ],
})
export class AppModule {}
