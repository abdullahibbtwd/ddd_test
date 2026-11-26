import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "./fixtures.js";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-19/screenshots",
);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

async function shot(page: Page, name: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
}

test.describe("compliance screenshots", () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test("capture certificates agreements food erase site", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone-390", "captures both viewports in one run");
    test.setTimeout(120_000);
    await login(page, OFFICE.email, OFFICE.password);

    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.goto("/certificates");
      await expect(page.getByTestId("certificates-page")).toBeVisible({ timeout: 15_000 });
      await shot(page, `certificates-list-${width}.png`, width, height);

      const firstRow = page.locator("table tbody tr").first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForTimeout(400);
        await shot(page, `certificates-drawer-${width}.png`, width, height);
        await page.keyboard.press("Escape");
      }

      await page.goto("/agreements");
      await expect(page.getByTestId("agreements-page")).toBeVisible();
      const renew = page.getByTestId("agreements-renew").first();
      if (await renew.isVisible()) {
        await renew.click();
        await expect(page.getByTestId("agreements-renew-dialog")).toBeVisible();
        await shot(page, `agreements-renew-${width}.png`, width, height);
        await page.keyboard.press("Escape");
      } else {
        await shot(page, `agreements-list-${width}.png`, width, height);
      }

      await page.goto("/food");
      await expect(page.getByTestId("food-page")).toBeVisible();
      await shot(page, `food-schedules-${width}.png`, width, height);
      await page.getByTestId("food-tab-records").click();
      await page.waitForTimeout(300);
      await shot(page, `food-records-${width}.png`, width, height);

      await page.goto("/sites");
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await page.waitForTimeout(500);
        await shot(page, `site-certificates-${width}.png`, width, height);
        await page.keyboard.press("Escape");
      }
    }

    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/certificates");
    await expect(page.getByTestId("certificates-page")).toBeVisible({ timeout: 15_000 });
    const row = page.locator("table tbody tr").first();
    if (await row.isVisible()) {
      await row.click();
      const erase = page.getByTestId("certificates-erase");
      if (await erase.isVisible()) {
        await erase.click();
        await shot(page, "erase-confirm-1440.png", 1440, 900);
      }
    }
  });
});
