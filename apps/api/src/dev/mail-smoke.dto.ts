import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const MailSmokeBodySchema = z.object({
  to: z.email(),
});

export class MailSmokeBodyDto extends createZodDto(MailSmokeBodySchema) {}
