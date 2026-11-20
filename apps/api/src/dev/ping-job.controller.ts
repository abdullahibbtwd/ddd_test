import { Body, Controller, Post } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ApiTags } from "@nestjs/swagger";
import { QUEUE_NAMES } from "@ddcrm/shared";
import { Queue } from "bullmq";
import { Can } from "../auth/decorators/can.decorator";
import { PingJobBodyDto } from "./ping-job.dto";
import type { PingJobData } from "../processors/default.processor";

@ApiTags("dev")
@Controller("dev")
export class PingJobController {
  constructor(
    @InjectQueue(QUEUE_NAMES.DEFAULT)
    private readonly defaultQueue: Queue<PingJobData>,
  ) {}

  @Can("manage", "Setting")
  @Post("ping-job")
  async enqueuePingJob(@Body() body: PingJobBodyDto) {
    const job = await this.defaultQueue.add("ping", {
      fail: body.fail === true,
    });

    return {
      id: job.id,
      name: job.name,
      queue: QUEUE_NAMES.DEFAULT,
      data: job.data,
    };
  }
}
