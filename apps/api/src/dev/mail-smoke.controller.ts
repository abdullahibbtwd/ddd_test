import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Can } from "../auth/decorators/can.decorator";
import { MailQueueService } from "../mail/mail-queue.service";
import {
  renderSmokeEmail,
  SMOKE_EMAIL_SUBJECT,
} from "../mail/templates/smoke";
import { PdfService } from "../pdf/pdf.service";
import { buildKey } from "../storage/build-key";
import { StorageService } from "../storage/storage.service";
import { MailSmokeBodyDto } from "./mail-smoke.dto";

@ApiTags("dev")
@Controller("dev")
export class MailSmokeController {
  constructor(
    @Inject(MailQueueService) private readonly mailQueue: MailQueueService,
    @Inject(PdfService) private readonly pdf: PdfService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Can("manage", "Setting")
  @Post("mail-smoke")
  async mailSmoke(@Body() body: MailSmokeBodyDto) {
    const { html, text } = await renderSmokeEmail();
    const job = await this.mailQueue.enqueue({
      to: body.to,
      subject: SMOKE_EMAIL_SUBJECT,
      html,
      text,
    });
    return { id: job.id, queue: "email", to: body.to };
  }

  @Can("manage", "Setting")
  @Post("mail-smoke-pdf")
  async mailSmokePdf(@Body() body: MailSmokeBodyDto) {
    const pdf = await this.pdf.smokePdf();
    const storageKey = buildKey("smoke-pdf", "pdf");
    await this.storage.put(storageKey, pdf, "application/pdf");

    const { html, text } = await renderSmokeEmail();
    const job = await this.mailQueue.enqueue({
      to: body.to,
      subject: `${SMOKE_EMAIL_SUBJECT} (с PDF)`,
      html,
      text,
      attachments: [{ filename: "pdf-smoke.pdf", storageKey }],
    });

    return {
      id: job.id,
      queue: "email",
      to: body.to,
      storageKey,
    };
  }
}
