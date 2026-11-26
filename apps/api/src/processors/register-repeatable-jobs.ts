import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { jobId, QUEUE_NAMES } from "@ddcrm/shared";
import type { Queue } from "bullmq";
import { AUTH_SESSIONS_CLEANUP_JOB } from "./default.processor";
import {
  NOTIFICATION_SWEEP_CRON,
  NOTIFICATION_SWEEP_JOB,
  NOTIFICATION_SWEEP_TZ,
} from "./notification-schedule";

/**
 * Registers repeatable jobs. Imported ONLY by ProcessorsModule (worker).
 * BullMQ 6 uses upsertJobScheduler (repeat on Queue.add was removed).
 * Deterministic scheduler id prevents duplicates on restart.
 */
@Injectable()
export class RegisterRepeatableJobs implements OnModuleInit {
  private readonly logger = new Logger(RegisterRepeatableJobs.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DEFAULT) private readonly defaultQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const schedulerId = jobId(AUTH_SESSIONS_CLEANUP_JOB);
    await this.defaultQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: "0 3 * * *",
        tz: "Europe/Sofia",
      },
      {
        name: AUTH_SESSIONS_CLEANUP_JOB,
        data: {},
      },
    );
    this.logger.log(
      `Registered job scheduler ${schedulerId} → ${AUTH_SESSIONS_CLEANUP_JOB} (03:00 Europe/Sofia)`,
    );

    const sweepId = jobId(NOTIFICATION_SWEEP_JOB);
    await this.notificationsQueue.upsertJobScheduler(
      sweepId,
      {
        pattern: NOTIFICATION_SWEEP_CRON,
        tz: NOTIFICATION_SWEEP_TZ,
      },
      {
        name: NOTIFICATION_SWEEP_JOB,
        data: {},
      },
    );
    this.logger.log(
      `Registered job scheduler ${sweepId} → ${NOTIFICATION_SWEEP_JOB} (07:00 ${NOTIFICATION_SWEEP_TZ}, explicit tz — not the process timezone)`,
    );
  }
}
