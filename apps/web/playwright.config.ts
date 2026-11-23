import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const API_PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "bg-BG",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @ddcrm/api exec nest start`,
      url: `http://localhost:${API_PORT}/api/health`,
      // Always start with E2E=1 so login throttle does not flake the suite.
      // Default: start a fresh API (reuseExistingServer false) so a stale dev
      // server without E2E=1 cannot cause login throttling failures.
      // Opt in to reuse with PW_REUSE=1 for local debugging against an existing stack.
      reuseExistingServer: process.env.PW_REUSE === "1",
      timeout: 180_000,
      cwd: "../..",
      env: { ...process.env, E2E: "1" },
    },
    {
      // Dev server: /dev/styleguide only exists outside production.
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: process.env.PW_REUSE === "1",
      timeout: 120_000,
    },
  ],
});
