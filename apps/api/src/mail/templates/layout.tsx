import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const colors = {
  ink: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  accent: "#1F6F54",
  bg: "#ffffff",
};

export type MailLayoutProps = {
  preview: string;
  children: ReactNode;
};

export function MailLayout({ preview, children }: MailLayoutProps) {
  return (
    <Html lang="bg">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#F9FAFB",
          margin: 0,
          padding: "24px 12px",
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: colors.ink,
        }}
      >
        <Container
          style={{
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            maxWidth: "560px",
            margin: "0 auto",
            padding: "28px 24px",
          }}
        >
          <Text
            style={{
              margin: "0 0 16px",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.accent,
              fontWeight: 600,
            }}
          >
            DD CRM
          </Text>
          <Section>{children}</Section>
          <Text
            style={{
              margin: "28px 0 0",
              paddingTop: "16px",
              borderTop: `1px solid ${colors.border}`,
              fontSize: "12px",
              color: colors.muted,
            }}
          >
            Това е системно съобщение от DD CRM.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
