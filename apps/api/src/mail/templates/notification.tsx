import { Heading, Text } from "@react-email/components";
import { render } from "@react-email/render";
import {
  NotificationKind,
  type NotificationBodyParams,
  type NotificationKind as NotificationKindType,
} from "@ddcrm/shared";
import { MailLayout } from "./layout";

/**
 * Bulgarian copy for notification emails. The worker does not load i18next;
 * these sentences match apps/web/src/i18n/locales/bg/notifications.json.
 * No amounts, no personal names, no client legal names.
 */
export function notificationEmailCopy(input: {
  kind: NotificationKindType;
  bodyI18nKey: string;
  params: NotificationBodyParams;
}): { subject: string; body: string } {
  const site = String(input.params.siteName ?? "обект");
  const expires = String(input.params.expiresAt ?? "");
  const due = String(input.params.dueDate ?? "");
  const number = String(input.params.invoiceNumber ?? "");

  if (input.bodyI18nKey === "clientBody.AGREEMENT_EXPIRING") {
    return {
      subject: "Вашият договор изтича",
      body: `Вашият договор за ${site} изтича на ${expires}.`,
    };
  }

  switch (input.kind) {
    case NotificationKind.CERTIFICATE_EXPIRING:
      return {
        subject: "Здравен сертификат изтича",
        body: `Сертификат за обект ${site} изтича на ${expires}.`,
      };
    case NotificationKind.AGREEMENT_EXPIRING:
      return {
        subject: "Договор изтича",
        body: `Договорът за ${site} изтича на ${expires}.`,
      };
    case NotificationKind.FOOD_SCHEDULE_DUE:
      return {
        subject: "ХВП график е дължим",
        body: `Графикът за ${site} е дължим на ${due}.`,
      };
    case NotificationKind.INVOICE_OVERDUE:
      return {
        subject: "Просрочена фактура",
        body: `Фактура ${number} е с падеж ${due}.`,
      };
  }
}

export function NotificationEmail({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  return (
    <MailLayout preview={subject}>
      <Heading
        as="h1"
        style={{
          fontSize: "20px",
          fontWeight: 600,
          margin: "0 0 12px",
          color: "#111827",
        }}
      >
        {subject}
      </Heading>
      <Text style={{ margin: 0, fontSize: "14px", lineHeight: "1.5" }}>{body}</Text>
    </MailLayout>
  );
}

export async function renderNotificationEmail(input: {
  kind: NotificationKindType;
  bodyI18nKey: string;
  params: NotificationBodyParams;
}): Promise<{ subject: string; html: string; text: string }> {
  const copy = notificationEmailCopy(input);
  const element = <NotificationEmail subject={copy.subject} body={copy.body} />;
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return { subject: copy.subject, html, text };
}
