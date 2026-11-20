import { createFileRoute } from "@tanstack/react-router";
import { SectionPlaceholder } from "@/pages/section-placeholder";

export const Route = createFileRoute("/_shell/reports")({
  component: () => <SectionPlaceholder section="reports" />,
});
