import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { EmailEventKind, QUEUE_NAMES, createId, jobId, todayInSofia } from "@ddcrm/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Job, type Queue } from "bullmq";
import { runWithActorContextAsync } from "../audit/actor-context";
import type { MailService } from "../mail/mail.types";
import { MAIL_SERVICE } from "../mail/mail.types";
import {
  deliverNotificationEmail,
  type NotificationEmailJobData,
} from "../notifications/deliver-notification-email";
import {
  NotificationSweepService,
  type PendingNotificationEmail,
} from "../notifications/notification-sweep.service";
import { notificationSystemActor } from "../notifications/system-actor";
import { PrismaService } from "../prisma/prisma.service";
import {
  NOTIFICATION_EMAIL_JOB,
  NOTIFICATION_SWEEP_JOB,
} from "./notification-schedule";

export type NotificationSweepJobData = {
  /** Injected clock for tests. The scheduler sends {}. */
  asOf?: string;
};

/**
 * One worker for the `notifications` queue: the daily sweep and the
 * per-notification emails. Deterministic email job id:
 * `notification_email_<notificationId>`.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationSweepService) private readonly sweep: NotificationSweepService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly queue: Queue,
  ) {
    super();
  }

  async process(
    job: Job<NotificationSweepJobData | NotificationEmailJobData>,
  ): Promise<{ ok: true; created?: number }> {
    if (job.name === NOTIFICATION_SWEEP_JOB) {
      return this.runSweep(job as Job<NotificationSweepJobData>);
    }
    if (job.name === NOTIFICATION_EMAIL_JOB) {
      const data = job.data as NotificationEmailJobData;
      await deliverNotificationEmail({
        prisma: this.prisma,
        mail: this.mail,
        data,
        actorLabel: `worker:${QUEUE_NAMES.NOTIFICATIONS}:${job.name}`,
      });
      return { ok: true };
    }
    this.logger.warn(`Unknown notifications job name: ${job.name}`);
    return { ok: true };
  }

  /** Exposed for the manual sweep script and tests. */
  async runSweep(job: Job<NotificationSweepJobData>): Promise<{ ok: true; created: number }> {
    const asOf =
      job.data.asOf && /^\d{4}-\d{2}-\d{2}$/.test(job.data.asOf)
        ? job.data.asOf
        : todayInSofia(new Date());
    this.logger.log(`Notification sweep asOf=${asOf}`);
    const result = await this.sweep.run(asOf, (emails) => this.enqueueEmails(emails));
    return { ok: true, created: result.created };
  }

  private async enqueueEmails(emails: PendingNotificationEmail[]): Promise<void> {
    for (const email of emails) {
      const deterministicJobId = jobId("notification_email", email.notificationId);
      const emailEventId = createId();
      try {
        await runWithActorContextAsync(notificationSystemActor(deterministicJobId), () =>
          this.prisma.emailEvent.create({
            data: {
              id: emailEventId,
              invoiceId: null,
              notificationId: email.notificationId,
              kind: EmailEventKind.NOTIFICATION,
              toAddress: email.to,
              jobId: deterministicJobId,
            },
          }),
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/email_events_job_id|unique|P2002/i.test(msg)) {
          continue;
        }
        this.logger.error(`Failed to record notification email event: ${msg}`);
        continue;
      }

      try {
        await this.queue.add(
          NOTIFICATION_EMAIL_JOB,
          {
            notificationId: email.notificationId,
            emailEventId,
            to: email.to,
          } satisfies NotificationEmailJobData,
          { jobId: deterministicJobId },
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/already exists|JobId|duplicat/i.test(msg)) {
          continue;
        }
        this.logger.error(`Failed to enqueue notification email: ${msg}`);
      }
    }
  }
}
