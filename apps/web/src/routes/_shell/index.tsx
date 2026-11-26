import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/routes/_shell/-dashboard-page";

export const Route = createFileRoute("/_shell/")({
  component: DashboardPage,
});
