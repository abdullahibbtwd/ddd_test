import type { DefaultJobOptions } from "bullmq";

export const FOURTEEN_DAYS_SECONDS = 14 * 24 * 60 * 60;

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: {
    age: FOURTEEN_DAYS_SECONDS,
  },
};
