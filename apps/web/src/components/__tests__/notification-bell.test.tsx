import { NotificationKind, NotificationPriority } from "@ddcrm/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/notification-bell";
import { formatRelativeBg, priorityBadgeVariant } from "@/lib/relative-time";

const read = vi.fn(async () => ({}));
const dismiss = vi.fn(async () => ({}));

const unreadItem = {
  id: "019a0000-0000-7000-8000-0000000000a1",
  kind: NotificationKind.CERTIFICATE_EXPIRING,
  priority: NotificationPriority.HIGH,
  entityType: "health_certificates",
  entityId: "019a0000-0000-7000-8000-000000000101",
  thresholdDay: 7,
  titleI18nKey: "kinds.CERTIFICATE_EXPIRING.title",
  bodyI18nKey: "kinds.CERTIFICATE_EXPIRING.body",
  bodyParams: { siteName: "Кухня", expiresAt: "2026-07-15", employeeId: "emp-1" },
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  readAt: null,
  dismissedAt: null,
};

const readItem = {
  ...unreadItem,
  id: "019a0000-0000-7000-8000-0000000000a2",
  kind: NotificationKind.INVOICE_OVERDUE,
  priority: NotificationPriority.HIGH,
  titleI18nKey: "kinds.INVOICE_OVERDUE.title",
  bodyI18nKey: "kinds.INVOICE_OVERDUE.body",
  bodyParams: { invoiceNumber: "0000000001", dueDate: "2026-06-01" },
  readAt: new Date().toISOString(),
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(async () => undefined),
  useRouteContext: () => ({ user: { role: "ADMIN", id: "u1" } }),
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("@/api/generated/notifications/notifications", () => ({
  getNotificationsControllerMeQueryKey: () => ["/api/notifications/me"],
  useNotificationsControllerMe: (params?: { unreadOnly?: boolean }) => ({
    data: {
      data: {
        items: params?.unreadOnly === false ? [unreadItem, readItem] : [unreadItem],
        total: params?.unreadOnly === false ? 2 : 1,
      },
    },
    refetch: vi.fn(),
  }),
  useNotificationsControllerRead: () => ({ mutateAsync: read }),
  useNotificationsControllerDismiss: () => ({ mutateAsync: dismiss }),
  useNotificationsControllerReadAll: () => ({ mutateAsync: vi.fn(async () => ({ data: { count: 1 } })) }),
  useNotificationsControllerSummary: () => ({
    data: {
      data: {
        kinds: [
          {
            kind: NotificationKind.AGREEMENT_EXPIRING,
            unread: 0,
            read: 0,
            dismissed: 0,
            clientContact: 1,
          },
        ],
      },
    },
  }),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("notification bell", () => {
  beforeEach(() => {
    read.mockClear();
    dismiss.mockClear();
  });

  it("shows the unread count and renders the popover with i18n params", async () => {
    const user = userEvent.setup();
    render(wrap(<NotificationBell />));
    expect(screen.getByTestId("notification-bell-count")).toHaveTextContent("1");
    await user.click(screen.getByTestId("notification-bell"));
    expect(screen.getByTestId("notification-popover")).toBeInTheDocument();
    expect(screen.getByText("Сертификат за обект Кухня изтича на 2026-07-15.")).toBeInTheDocument();
    expect(screen.getByText("преди 2 часа")).toBeInTheDocument();
    const badge = screen.getByText("Високо");
    expect(badge).toHaveAttribute("data-variant", "warn");
    expect(priorityBadgeVariant("HIGH")).toBe("warn");
    expect(priorityBadgeVariant("NORMAL")).toBe("neutral");
  });

  it("marks read on click and dismisses without deleting the copy", async () => {
    const user = userEvent.setup();
    render(wrap(<NotificationBell />));
    await user.click(screen.getByTestId("notification-bell"));
    await user.click(screen.getByTestId(`notification-item-${NotificationKind.CERTIFICATE_EXPIRING}`));
    expect(read).toHaveBeenCalledWith({ id: unreadItem.id });
    render(wrap(<NotificationBell />));
    await user.click(screen.getAllByTestId("notification-bell")[1]!);
    await user.click(screen.getByTestId(`notification-dismiss-${unreadItem.id}`));
    expect(dismiss).toHaveBeenCalledWith({ id: unreadItem.id });
  });

  it("formats relative time in Bulgarian", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    expect(formatRelativeBg("2026-06-15T11:59:30.000Z", now)).toBe("преди малко");
    expect(formatRelativeBg("2026-06-15T10:00:00.000Z", now)).toBe("преди 2 часа");
    expect(formatRelativeBg("2026-06-14T12:00:00.000Z", now)).toBe("преди 1 ден");
  });
});
