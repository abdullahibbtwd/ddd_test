import { createFileRoute } from "@tanstack/react-router";
import { SitesPage } from "./sites-page";

type SitesSearch = {
  new?: string;
  clientId?: string;
  siteId?: string;
  tab?: "data" | "visits" | "subscription";
  hasSubscription?: boolean;
};

export const Route = createFileRoute("/_shell/sites")({
  validateSearch: (search: Record<string, unknown>): SitesSearch => ({
    new: typeof search.new === "string" ? search.new : undefined,
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
    siteId: typeof search.siteId === "string" ? search.siteId : undefined,
    tab:
      search.tab === "visits" || search.tab === "subscription" || search.tab === "data"
        ? search.tab
        : undefined,
    hasSubscription:
      search.hasSubscription === true || search.hasSubscription === "true"
        ? true
        : search.hasSubscription === false || search.hasSubscription === "false"
          ? false
          : undefined,
  }),
  component: SitesPage,
});
