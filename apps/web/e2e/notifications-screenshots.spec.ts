import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "./fixtures.js";

const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-20/screenshots",
);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

async function shot(page: Page, name: string, width: number, height: number, fullPage = true) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
}

test.describe("notification screenshots", () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test("capture bell, list, summary, phone sheet", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone-390", "captures both viewports in one run");
    test.setTimeout(120_000);
    await login(page, ADMIN.email, ADMIN.password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("[data-testid=notification-bell]:visible").click();
    await expect(page.getByTestId("notification-popover")).toBeVisible();
    await shot(page, "bell-popover-1440.png", 1440, 900);
    await page.goto("/notifications");
    await expect(page.getByTestId("notifications-page")).toBeVisible();
    await shot(page, "notifications-1440.png", 1440, 900);
    await shot(page, "summary-1440.png", 1440, 900);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sites");
    await page.locator("[data-testid=notification-bell]:visible").click();
    await expect(page.getByTestId("notification-bell-sheet")).toBeVisible();
    await shot(page, "bell-sheet-390.png", 390, 844, false);

    await page.context().clearCookies();
    await login(page, OFFICE.email, OFFICE.password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/notifications");
    await shot(page, "notifications-390.png", 390, 844);
  });
});
