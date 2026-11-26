import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Job } from "bullmq";
import { runWithActorContextAsync } from "../audit/actor-context";
import {
  INVOICE_EMAIL_JOB,
  type InvoiceEmailJobData,
} from "../invoices/invoices-documents.service";
import { InvoicePdfService } from "../invoices/invoice-pdf.service";
import type { MailService } from "../mail/mail.types";
import { MAIL_SERVICE } from "../mail/mail.types";
import { PrismaService } from "../prisma/prisma.service";

@Processor(QUEUE_NAMES.INVOICE_EMAIL)
export class InvoiceEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceEmailProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvoicePdfService) private readonly invoicePdf: InvoicePdfService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<InvoiceEmailJobData>): Promise<{ ok: true }> {
    return runWithActorContextAsync(
      {
        source: "worker",
        actorUserId: null,
        actorLabel: `worker:${QUEUE_NAMES.INVOICE_EMAIL}:${job.name}`,
        requestId: job.id ? String(job.id) : null,
        ip: null,
      },
      async () => {
        if (job.name !== INVOICE_EMAIL_JOB) {
          this.logger.warn(`Unknown invoice-email job name: ${job.name}`);
          return { ok: true };
        }

        const { invoiceId, emailEventId, to } = job.data;
        this.logger.log(`Sending invoice email job ${job.id} invoice=${invoiceId} to=${to}`);

        try {
          const pdf = await this.invoicePdf.renderById(invoiceId, false);
          const invoice = await this.prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
            select: { number: true },
          });

          await this.mail.send({
            to,
            subject: `Фактура ${invoice.number ?? invoiceId}`,
            html: `<p>Здравейте,</p><p>Прилагаме фактура <strong>${invoice.number ?? ""}</strong>.</p>`,
            text: `Здравейте,\n\nПрилагаме фактура ${invoice.number ?? ""}.\n`,
            attachments: [
              {
                filename: `faktura-${invoice.number ?? invoiceId}.pdf`,
                content: pdf,
                contentType: "application/pdf",
              },
            ],
          });

          const now = new Date();
          await this.prisma.emailEvent.update({
            where: { id: emailEventId },
            data: { sentAt: now, failedAt: null, error: null },
          });
          await this.prisma.invoice.update({
            where: { id: invoiceId },
            data: { emailSentAt: now, emailLastError: null },
          });

          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Invoice email failed: ${message}`);

          await this.prisma.emailEvent.update({
            where: { id: emailEventId },
            data: { failedAt: new Date(), error: message },
          });

          const attempts = job.opts.attempts ?? 1;
          const isFinal = job.attemptsMade + 1 >= attempts;
          if (isFinal) {
            await this.prisma.invoice.update({
              where: { id: invoiceId },
              data: { emailLastError: message },
            });
          }

          throw error;
        }
      },
    );
  }
}
