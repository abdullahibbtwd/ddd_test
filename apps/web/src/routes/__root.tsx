import { QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/toaster";
import { queryClient } from "@/lib/query-client";

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
