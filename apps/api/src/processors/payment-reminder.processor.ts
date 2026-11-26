import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import {
  computeOutstanding,
  InvoiceStatus,
  QUEUE_NAMES,
} from "@ddcrm/shared";
import { Job, UnrecoverableError } from "bullmq";
import { runWithActorContextAsync } from "../audit/actor-context";
import type { MailService } from "../mail/mail.types";
import { MAIL_SERVICE } from "../mail/mail.types";
import {
  PAYMENT_REMINDER_JOB,
  type PaymentReminderJobData,
} from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { dateToIsoDate } from "../common/date-string";

@Processor(QUEUE_NAMES.PAYMENT_REMINDER)
export class PaymentReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentReminderProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<PaymentReminderJobData>): Promise<{ ok: true }> {
    return runWithActorContextAsync(
      {
        source: "worker",
        actorUserId: null,
        actorLabel: `worker:${QUEUE_NAMES.PAYMENT_REMINDER}:${job.name}`,
        requestId: job.id ? String(job.id) : null,
        ip: null,
      },
      async () => {
        if (job.name !== PAYMENT_REMINDER_JOB) {
          this.logger.warn(`Unknown payment-reminder job name: ${job.name}`);
          return { ok: true };
        }

        const { invoiceId, emailEventId, to } = job.data;
        this.logger.log(
          `Sending payment reminder job ${job.id} invoice=${invoiceId} to=${to}`,
        );

        const invoice = await this.prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: {
            id: true,
            status: true,
            number: true,
            dueDate: true,
            grossAmount: true,
            clientLegalName: true,
          },
        });

        if (!invoice || invoice.status !== InvoiceStatus.ISSUED) {
          await this.prisma.emailEvent.update({
            where: { id: emailEventId },
            data: {
              failedAt: new Date(),
              error: "Invoice not issued",
            },
          });
          throw new UnrecoverableError("Invoice not issued — permanent failure");
        }

        const paidAgg = await this.prisma.payment.aggregate({
          where: { invoiceId },
          _sum: { amount: true },
        });
        const paidSum = Number(paidAgg._sum.amount ?? 0).toFixed(2);
        const gross = Number(invoice.grossAmount).toFixed(2);
        const outstanding = computeOutstanding(gross, [paidSum]);

        if (outstanding === "0.00") {
          await this.prisma.emailEvent.update({
            where: { id: emailEventId },
            data: {
              failedAt: new Date(),
              error: "Invoice paid before send",
            },
          });
          throw new UnrecoverableError(
            "Invoice paid between enqueue and send — permanent failure",
          );
        }

        const dueDate = invoice.dueDate ? dateToIsoDate(invoice.dueDate) : "";
        const clientName = invoice.clientLegalName ?? "";
        const number = invoice.number ?? invoiceId;

        const html = [
          `<p>Здравейте${clientName ? `, ${clientName}` : ""},</p>`,
          `<p>Напомняме ви за неплатена фактура <strong>${number}</strong>.</p>`,
          `<p>Падеж: <strong>${dueDate}</strong></p>`,
          `<p>Остава за плащане: <strong>${outstanding} EUR</strong></p>`,
          `<p>Моля, извършете плащането в най-кратък срок.</p>`,
        ].join("\n");
        const text = [
          `Здравейте${clientName ? `, ${clientName}` : ""},`,
          ``,
          `Напомняме ви за неплатена фактура ${number}.`,
          `Падеж: ${dueDate}`,
          `Остава за плащане: ${outstanding} EUR`,
          ``,
          `Моля, извършете плащането в най-кратък срок.`,
        ].join("\n");

        try {
          await this.mail.send({
            to,
            subject: `Напомняне за плащане — фактура ${number}`,
            html,
            text,
          });

          await this.prisma.emailEvent.update({
            where: { id: emailEventId },
            data: { sentAt: new Date(), failedAt: null, error: null },
          });

          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Payment reminder failed: ${message}`);

          await this.prisma.emailEvent.update({
            where: { id: emailEventId },
            data: { failedAt: new Date(), error: message },
          });

          throw error;
        }
      },
    );
  }
}
