import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The shell /visits placeholder was removed in Task 14.
 * Visit create/edit live at /visits/new and /visits/$id/edit.
 * «Този месец» is now /month.
 */
export const Route = createFileRoute("/_shell/visits")({
  beforeLoad: () => {
    throw redirect({ to: "/month" });
  },
  component: () => null,
});
