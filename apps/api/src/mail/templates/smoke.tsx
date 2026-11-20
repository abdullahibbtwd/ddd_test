import { Heading, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { MailLayout } from "./layout";

export type SmokeEmailProps = {
  recipientName?: string;
};

export function SmokeEmail({ recipientName = "колега" }: SmokeEmailProps) {
  return (
    <MailLayout preview="Смоук тест на имейл от DD CRM">
      <Heading
        as="h1"
        style={{
          fontSize: "20px",
          fontWeight: 600,
          margin: "0 0 12px",
          color: "#111827",
        }}
      >
        Смоук тест на имейл
      </Heading>
      <Text style={{ margin: "0 0 12px", fontSize: "14px", lineHeight: "1.5" }}>
        Здравейте, {recipientName}!
      </Text>
      <Text style={{ margin: "0 0 12px", fontSize: "14px", lineHeight: "1.5" }}>
        Това е пробно съобщение от DD CRM. Текстът съдържа кирилица, за да
        проверим кодирането през SMTP и Mailpit: Ресторант „Златната ябълка“,
        протокол за дезинсекция и дератизация.
      </Text>
      <Text style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#6B7280" }}>
        Ако четете това в Mailpit, каналът за имейли работи коректно.
      </Text>
    </MailLayout>
  );
}

export async function renderSmokeEmail(props: SmokeEmailProps = {}): Promise<{
  html: string;
  text: string;
}> {
  const element = <SmokeEmail {...props} />;
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return { html, text };
}

export const SMOKE_EMAIL_SUBJECT = "DD CRM · Смоук тест на имейл";
