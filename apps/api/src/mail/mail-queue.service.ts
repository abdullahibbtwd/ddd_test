import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { type JobsOptions, Queue } from "bullmq";
import type { EnqueueMailInput } from "./mail.types";

export const EMAIL_JOB_SEND = "send";

@Injectable()
export class MailQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL)
    private readonly emailQueue: Queue<EnqueueMailInput>,
  ) {}

  async enqueue(input: EnqueueMailInput, opts?: JobsOptions) {
    // Only forward explicit overrides so defaultJobOptions (attempts/backoff) stay intact.
    return this.emailQueue.add(EMAIL_JOB_SEND, input, opts);
  }
}
