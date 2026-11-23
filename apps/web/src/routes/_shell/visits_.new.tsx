import { createFileRoute } from "@tanstack/react-router";
import { VisitForm } from "./-visit-form";

type NewVisitSearch = {
  siteId: string;
};

export const Route = createFileRoute("/_shell/visits_/new")({
  validateSearch: (search: Record<string, unknown>): NewVisitSearch => ({
    siteId: typeof search.siteId === "string" ? search.siteId : "",
  }),
  component: NewVisitPage,
});

function NewVisitPage() {
  const { siteId } = Route.useSearch();
  if (!siteId) {
    return <VisitForm mode="create" siteId="" />;
  }
  return <VisitForm mode="create" siteId={siteId} />;
}
