import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import type { Job } from "bullmq";
import { runWithActorContextAsync } from "../audit/actor-context";
import { deleteExpiredAuthSessions } from "../auth/cleanup-expired-sessions";
import { PrismaService } from "../prisma/prisma.service";

export const AUTH_SESSIONS_CLEANUP_JOB = "auth-sessions-cleanup";

export type PingJobData = {
  fail?: boolean;
};

/**
 * Single consumer for the `default` queue (Nest BullMQ allows one @Processor
 * per queue name). Routes by job.name.
 */
@Processor(QUEUE_NAMES.DEFAULT)
export class DefaultProcessor extends WorkerHost {
  private readonly logger = new Logger(DefaultProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async process(
    job: Job<PingJobData | Record<string, never>>,
  ): Promise<unknown> {
    const label = `worker:${QUEUE_NAMES.DEFAULT}:${job.name}`;
    return runWithActorContextAsync(
      {
        source: "worker",
        actorUserId: null,
        actorLabel: label,
        requestId: job.id ? String(job.id) : null,
        ip: null,
      },
      async () => {
        if (job.name === AUTH_SESSIONS_CLEANUP_JOB) {
          const deleted = await deleteExpiredAuthSessions(this.prisma);
          this.logger.log(`Deleted ${deleted} expired auth sessions`);
          return { deleted };
        }

        // ping (and any other default-queue jobs)
        this.logger.log(`Ping job ${job.id} received: ${JSON.stringify(job.data)}`);
        const data = job.data as PingJobData;
        if (data?.fail === true) {
          throw new Error("Ping job failed on purpose");
        }
        return { ok: true, jobId: job.id };
      },
    );
  }
}
