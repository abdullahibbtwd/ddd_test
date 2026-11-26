/**
 * Runs the notification sweep once against the current database.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/run-notification-sweep.ts [YYYY-MM-DD]
 *
 * Boots the same worker entry as Tasks 16–19, enqueues emails, and waits
 * until the e2e client-contact message is sent (or times out).
 */
import { todayInSofia } from "@ddcrm/shared";
import { NestFactory } from "@nestjs/core";
import type { Job } from "bullmq";
import { NotificationProcessor } from "../src/processors/notification.processor";
import { NOTIFICATION_SWEEP_JOB } from "../src/processors/notification-schedule";
import { PrismaService } from "../src/prisma/prisma.service";
import { WorkerModule } from "../src/worker.module";

async function main(): Promise<void> {
  const asOf = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
    ? process.argv[2]
    : todayInSofia(new Date());
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn", "log"] });
  try {
    const processor = app.get(NotificationProcessor);
    const prisma = app.get(PrismaService);
    const job = { name: NOTIFICATION_SWEEP_JOB, data: { asOf } } as Job<{ asOf: string }>;
    const result = await processor.runSweep(job);
    const started = Date.now();
    let sent = false;
    while (Date.now() - started < 30_000) {
      const row = await prisma.emailEvent.findFirst({
        where: { kind: "NOTIFICATION", toAddress: "e2e-notify-yes@e2e.local", sentAt: { not: null } },
      });
      if (row) {
        sent = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log(JSON.stringify({ asOf, created: result.created, clientEmailSent: sent }));
    if (!sent) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
