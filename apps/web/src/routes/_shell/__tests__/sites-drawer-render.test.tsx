import { Role } from "@ddcrm/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const areasState = vi.hoisted(() => ({
  items: [] as Array<{ id: string; name: string; isActive: boolean }>,
}));
const typesState = vi.hoisted(() => ({
  items: [] as Array<{ id: string; name: string; isActive: boolean }>,
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    createFileRoute: () => (opts: { component: unknown }) => opts,
    useRouteContext: () => ({
      user: {
        id: "u1",
        email: "office@test.local",
        name: "Office",
        role: Role.OFFICE,
        areas: [],
        mustChangePassword: false,
      },
    }),
    useSearch: () => ({}),
    Link: ({ children, ...rest }: { children: ReactNode; [k: string]: unknown }) => (
      <a {...rest}>{children}</a>
    ),
  };
});

vi.mock("@/api/generated/sites/sites", () => ({
  getSitesControllerListQueryKey: () => ["sites"],
  getSitesControllerMapQueryKey: () => ["sites-map"],
  sitesControllerGetOne: vi.fn(),
  useSitesControllerList: () => ({
    data: { data: { items: [], total: 0 } },
    isLoading: false,
    isError: false,
  }),
  useSitesControllerMap: () => ({ data: undefined }),
  useSitesControllerCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSitesControllerUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSitesControllerDuplicates: () => ({ data: { data: { items: [] } } }),
}));

vi.mock("@/api/generated/clients/clients", () => ({
  useClientsControllerList: () => ({
    data: { data: { items: [], total: 0 } },
    isFetching: false,
  }),
  useClientsControllerDuplicates: () => ({ data: { data: { items: [] } } }),
}));

vi.mock("@/api/generated/areas/areas", () => ({
  useAreasControllerList: () => ({
    data: { data: { items: areasState.items, total: areasState.items.length } },
  }),
}));

vi.mock("@/api/generated/site-types/site-types", () => ({
  useSiteTypesControllerList: () => ({
    data: { data: { items: typesState.items } },
  }),
}));

vi.mock("@/components/sites-map", () => ({
  SitesMap: () => <div data-testid="sites-map" />,
  SiteLocationPicker: () => <div data-testid="site-location-picker" />,
}));

import { SitesPage } from "../-sites-page";

/** Hard ceiling — create-drawer open + one defaults refresh must stay well below this. */
const MAX_RENDERS = 40;

describe("SitesPage create drawer render depth", () => {
  beforeEach(() => {
    areasState.items = [];
    typesState.items = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("create mode stays under a fixed render budget when area/type defaults load", async () => {
    let renders = 0;
    function CountingPage() {
      renders += 1;
      return <SitesPage />;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const user = userEvent.setup();
    const view = render(
      <QueryClientProvider client={client}>
        <CountingPage />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Нов обект" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(renders).toBeLessThan(MAX_RENDERS);

    // Simulate lists arriving after the drawer opened — the old resetForm-in-deps
    // loop threw "Maximum update depth exceeded" here.
    await act(async () => {
      areasState.items = [{ id: "area-1", name: "Център", isActive: true }];
      typesState.items = [{ id: "type-1", name: "Ресторант", isActive: true }];
      view.rerender(
        <QueryClientProvider client={client}>
          <CountingPage />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("site-location-picker")).toBeInTheDocument();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renders).toBeLessThan(MAX_RENDERS);
  });
});
