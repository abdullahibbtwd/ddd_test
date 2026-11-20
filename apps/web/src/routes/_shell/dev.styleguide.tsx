import { Suspense, lazy } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

// Dev-only. In production builds `import.meta.env.DEV` is statically `false`, so the
// dynamic import below is dead-code eliminated and the style guide never ships.
const Styleguide = import.meta.env.DEV ? lazy(() => import("@/dev/styleguide")) : null;

export const Route = createFileRoute("/_shell/dev/styleguide")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: () => (Styleguide ? <Suspense fallback={null}><Styleguide /></Suspense> : null),
});
