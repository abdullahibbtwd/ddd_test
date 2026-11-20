import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Workspace package is CommonJS (dist); consume its ESM sources so the bundle tree-shakes
      // and dev/test do not require `pnpm --filter @ddcrm/shared build` first.
      "@ddcrm/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
