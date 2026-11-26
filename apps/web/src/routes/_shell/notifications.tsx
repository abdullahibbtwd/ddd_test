import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "./-notifications-page";

export const Route = createFileRoute("/_shell/notifications")({
  component: NotificationsPage,
});
