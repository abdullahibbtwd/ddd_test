import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const PingJobBodySchema = z.object({
  fail: z.boolean().optional(),
});

export class PingJobBodyDto extends createZodDto(PingJobBodySchema) {}
