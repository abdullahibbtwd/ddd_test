import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Job } from "bullmq";
import { runWithActorContextAsync } from "../audit/actor-context";
import type { EnqueueMailInput, MailService } from "../mail/mail.types";
import { MAIL_SERVICE } from "../mail/mail.types";
import { StorageService } from "../storage/storage.service";

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<EnqueueMailInput>): Promise<{ ok: true }> {
    return runWithActorContextAsync(
      {
        source: "worker",
        actorUserId: null,
        actorLabel: `worker:${QUEUE_NAMES.EMAIL}:${job.name}`,
        requestId: job.id ? String(job.id) : null,
        ip: null,
      },
      async () => {
        this.logger.log(`Sending email job ${job.id} to ${String(job.data.to)}`);

        const attachments = [];
        for (const ref of job.data.attachments ?? []) {
          const content = await this.storage.getBuffer(ref.storageKey);
          attachments.push({
            filename: ref.filename,
            content,
            contentType: guessContentType(ref.filename),
          });
        }

        await this.mail.send({
          to: job.data.to,
          subject: job.data.subject,
          html: job.data.html,
          text: job.data.text,
          replyTo: job.data.replyTo,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        return { ok: true };
      },
    );
  }
}

function guessContentType(filename: string): string | undefined {
  if (filename.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  return undefined;
}
