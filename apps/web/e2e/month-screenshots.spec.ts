import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const MONTH = "2026-11";
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-14/screenshots",
);

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(creds.email);
  await page.getByLabel("Парола").fill(creds.password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

test.use({
  consoleGuard: {
    allowApiFailures: [{ status: 404, url: /\/api\// }],
    allowConsole: [],
  },
});

test("capture /month screenshots at 1440 and 390", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run",
  );
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  };

  await login(page, OFFICE);
  await page.goto(`/month?month=${MONTH}`);
  await expect(page.getByTestId("month-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("month-summary")).toBeVisible();
  await page.getByTestId("month-employee-filter").getByRole("combobox").click();
  await page.getByRole("option", { name: "E2E Field", exact: true }).click();
  await expect(page.getByText("E2E Месец Просрочен")).toBeVisible({ timeout: 15_000 });

  await shot("month-list-1440.png", 1440, 900);
  await shot("month-list-390.png", 390, 844);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("month-tab-calendar").click();
  await expect(page.getByTestId("month-calendar-grid")).toBeVisible();
  await shot("month-calendar-1440.png", 1440, 900);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("month-calendar-weeklist")).toBeVisible();
  await shot("month-calendar-weeklist-390.png", 390, 844);

  await page.getByTestId("month-day-mobile-2026-11-10").click();
  await expect(page.getByTestId("month-day-drawer")).toBeVisible({ timeout: 10_000 });
  await shot("month-day-drawer-390.png", 390, 844);
  await page.getByRole("button", { name: "Затвори" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("month-tab-list").click();
  // Employee with no matching visits → empty list (not a far-future month,
  // which would still show OVERDUE/NOT_STARTED rows).
  await page.goto(
    `/month?month=${MONTH}&employeeId=00000000-0000-4000-8000-000000000099`,
  );
  await expect(page.getByTestId("month-empty")).toBeVisible({ timeout: 15_000 });
  await shot("month-empty-1440.png", 1440, 900);
  await shot("month-empty-390.png", 390, 844);
});
