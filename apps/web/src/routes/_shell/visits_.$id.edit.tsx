import type { VisitItem } from "@ddcrm/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useVisitsControllerGetOne } from "@/api/generated/visits/visits";
import { VisitForm } from "./-visit-form";

export const Route = createFileRoute("/_shell/visits_/$id/edit")({
  component: EditVisitPage,
});

function EditVisitPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation("visits");
  const visitQuery = useVisitsControllerGetOne(id);
  const visit = (visitQuery.data?.data ?? null) as VisitItem | null;

  if (visitQuery.isLoading) {
    return <div className="p-4 text-sm text-ink-muted">{t("loading")}</div>;
  }

  if (visitQuery.isError || !visit) {
    return <VisitForm mode="edit" siteId="" visit={null} />;
  }

  return <VisitForm mode="edit" siteId={visit.siteId} visit={visit} />;
}
