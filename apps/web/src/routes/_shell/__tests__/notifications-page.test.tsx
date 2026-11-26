import { NotificationKind } from "@ddcrm/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "@/routes/_shell/-notifications-page";

const readAll = vi.fn(async () => ({ data: { count: 1 } }));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useNavigate: () => vi.fn(async () => undefined),
    useRouteContext: () => ({ user: { role: "ADMIN", id: "u1" } }),
  };
});

vi.mock("@/api/generated/notifications/notifications", () => ({
  getNotificationsControllerMeQueryKey: () => ["/api/notifications/me"],
  useNotificationsControllerMe: (params?: { unreadOnly?: boolean }) => ({
    data: {
      data: {
        items:
          params?.unreadOnly === false
            ? [
                {
                  id: "1",
                  kind: NotificationKind.INVOICE_OVERDUE,
                  priority: "HIGH",
                  entityType: "invoices",
                  entityId: "019a0000-0000-7000-8000-000000000201",
                  thresholdDay: 0,
                  titleI18nKey: "kinds.INVOICE_OVERDUE.title",
                  bodyI18nKey: "kinds.INVOICE_OVERDUE.body",
                  bodyParams: { invoiceNumber: "0000000009", dueDate: "2026-06-01" },
                  createdAt: new Date().toISOString(),
                  readAt: new Date().toISOString(),
                  dismissedAt: null,
                },
              ]
            : [],
        total: params?.unreadOnly === false ? 1 : 0,
        page: 1,
        pageSize: 20,
      },
    },
  }),
  useNotificationsControllerRead: () => ({ mutateAsync: vi.fn() }),
  useNotificationsControllerDismiss: () => ({ mutateAsync: vi.fn() }),
  useNotificationsControllerReadAll: () => ({ mutateAsync: readAll }),
  useNotificationsControllerSummary: () => ({
    data: {
      data: {
        kinds: [
          {
            kind: NotificationKind.CERTIFICATE_EXPIRING,
            unread: 1,
            read: 0,
            dismissed: 0,
            clientContact: 0,
          },
        ],
      },
    },
  }),
}));

describe("/notifications filters", () => {
  it("toggles unread-only, shows the read invoice, the summary, and mark-all", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <NotificationsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("notifications-summary")).toBeInTheDocument();
    expect(screen.getByText("Няма известия.")).toBeInTheDocument();
    await user.click(screen.getByTestId("notifications-filter-unread"));
    expect(screen.getByText(/Фактура 0000000009/)).toBeInTheDocument();
    await user.click(screen.getByTestId("notifications-mark-all"));
    expect(readAll).toHaveBeenCalled();
  });
});
