import { Role, ServiceType, SubscriptionFrequency } from "@ddcrm/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/api/generated/subscriptions/subscriptions", () => ({
  getSubscriptionsControllerListQueryKey: () => ["subscriptions"],
  useSubscriptionsControllerList: () => ({
    data: { data: { items: listState.items, total: listState.items.length } },
    isLoading: false,
  }),
  useSubscriptionsControllerCreate: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSubscriptionsControllerUpdate: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/api/generated/sites/sites", () => ({
  getSitesControllerListQueryKey: () => ["sites"],
}));

import { SitesSubscriptionPanel } from "../-sites-subscription-panel";

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SitesSubscriptionPanel", () => {
  beforeEach(() => {
    listState.items = [];
  });

  it("shows empty state and new button for managers", async () => {
    wrap(<SitesSubscriptionPanel siteId="site-1" canManage />);
    expect(screen.getByTestId("subscription-empty")).toHaveTextContent("Няма активен абонамент");
    expect(screen.getByRole("button", { name: "Нов абонамент" })).toBeInTheDocument();
  });

  it("FIELD empty state has no buttons", () => {
    wrap(<SitesSubscriptionPanel siteId="site-1" canManage={false} />);
    expect(screen.getByTestId("subscription-empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Нов абонамент" })).not.toBeInTheDocument();
  });

  it("shows current subscription read block with money and period", () => {
    listState.items = [
      {
        id: "sub-1",
        siteId: "site-1",
        site: { id: "site-1", name: "S" },
        services: [ServiceType.INSECT_CONTROL, ServiceType.RODENT_CONTROL],
        frequency: SubscriptionFrequency.MONTHLY,
        rate: 80,
        rateIncludesVat: true,
        startDate: "2025-01-01",
        endDate: null,
        notes: "бележка",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    wrap(<SitesSubscriptionPanel siteId="site-1" canManage />);
    expect(screen.getByTestId("subscription-current")).toBeInTheDocument();
    expect(screen.getByText(/Дезинсекция/)).toBeInTheDocument();
    expect(screen.getByText(/с ДДС/)).toBeInTheDocument();
    expect(screen.getByText(/безсрочен/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Редактирай" })).toBeInTheDocument();
    void Role;
  });

  it("form validates at least one service", async () => {
    const user = userEvent.setup();
    wrap(<SitesSubscriptionPanel siteId="site-1" canManage />);
    await user.click(screen.getByRole("button", { name: "Нов абонамент" }));
    expect(screen.getByTestId("subscription-form")).toBeInTheDocument();

    // Uncheck the default service
    const insect = screen.getByLabelText("Дезинсекция");
    await user.click(insect);

    await user.click(screen.getByRole("button", { name: "Запази" }));
    await waitFor(() => {
      expect(screen.getByText("Изберете поне една услуга.")).toBeInTheDocument();
    });
  });
});
