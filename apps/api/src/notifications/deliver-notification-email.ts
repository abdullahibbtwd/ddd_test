import { Logger } from "@nestjs/common";
import { buildBodyParams, type NotificationKind } from "@ddcrm/shared";
import { runWithActorContextAsync } from "../audit/actor-context";
import type { MailService } from "../mail/mail.types";
import { renderNotificationEmail } from "../mail/templates/notification";
import type { PrismaService } from "../prisma/prisma.service";

const logger = new Logger("NotificationEmail");

export type NotificationEmailJobData = {
  notificationId: string;
  emailEventId: string;
  to: string;
};

/**
 * Sends one notification email. SMTP failure updates email_events and rethrows
 * so BullMQ retries. The notification row is never updated here.
 */
export async function deliverNotificationEmail(input: {
  prisma: PrismaService;
  mail: MailService;
  data: NotificationEmailJobData;
  actorLabel: string;
}): Promise<void> {
  const { prisma, mail, data } = input;
  const notification = await prisma.notification.findUnique({
    where: { id: data.notificationId },
  });
  if (!notification) {
    await markFailed(prisma, data.emailEventId, "Notification missing", input.actorLabel);
    throw new Error("Notification missing");
  }

  try {
    const rendered = await renderNotificationEmail({
      kind: notification.kind as NotificationKind,
      bodyI18nKey: notification.bodyI18nKey,
      params: buildBodyParams({ bodyParams: notification.bodyParams }),
    });
    await mail.send({
      to: data.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await runWithActorContextAsync(
      {
        source: "worker",
        actorUserId: null,
        actorLabel: input.actorLabel,
        requestId: data.emailEventId,
        ip: null,
      },
      () =>
        prisma.emailEvent.update({
          where: { id: data.emailEventId },
          data: { sentAt: new Date(), failedAt: null, error: null },
        }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Notification email failed: ${message}`);
    await markFailed(prisma, data.emailEventId, message, input.actorLabel);
    throw error;
  }
}

async function markFailed(
  prisma: PrismaService,
  emailEventId: string,
  message: string,
  actorLabel: string,
): Promise<void> {
  await runWithActorContextAsync(
    {
      source: "worker",
      actorUserId: null,
      actorLabel,
      requestId: emailEventId,
      ip: null,
    },
    () =>
      prisma.emailEvent.update({
        where: { id: emailEventId },
        data: { failedAt: new Date(), error: message.slice(0, 500) },
      }),
  );
}
