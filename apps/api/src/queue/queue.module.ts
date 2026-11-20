import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { QUEUE_NAME_LIST } from "@ddcrm/shared";
import { AppConfigService } from "../config/config.service";
import { DEFAULT_JOB_OPTIONS } from "./default-job-options";
import { redisConnectionFromUrl } from "./redis-connection";

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        prefix: config.bullmqPrefix,
        connection: redisConnectionFromUrl(config.redisUrl),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(...QUEUE_NAME_LIST.map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueueModule {}
