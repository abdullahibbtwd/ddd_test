import { expect, test, type Page } from "./fixtures.js";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

function eikFromPrefix(prefix8: string): string {
  const d = prefix8.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += d[i]! * (i + 1);
  let r = sum % 11;
  if (r === 10) {
    sum = 0;
    for (let i = 0; i < 8; i++) sum += d[i]! * (i + 3);
    r = sum % 11;
    if (r === 10) r = 0;
  }
  return `${prefix8}${r}`;
}

function uniqueEik(n: number): string {
  const base = (50000000 + (Date.now() % 40000000) + n * 41) % 100000000;
  return eikFromPrefix(String(base).padStart(8, "0"));
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

async function stubOsmTiles(page: Page) {
  await page.route("**/*tile.openstreetmap.org/**", async (route) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
}

test.describe("subscriptions", () => {
  test.beforeEach(async ({ page }) => {
    await stubOsmTiles(page);
  });

  test.describe("OFFICE subscription lifecycle", () => {
    test.use({
      consoleGuard: {
        allowApiFailures: [{ status: 409, url: /\/api\/subscriptions/ }],
      },
    });

    test("create, overlap error, end, history, terminate site", async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name === "phone-390",
        "intentional: full OFFICE subscription flow is long; phone covered by FIELD read-only test",
      );
      test.setTimeout(180_000);

      const suffix = `T12-${Date.now()}`;
      const clientName = `Е2Е Абонамент Клиент ${suffix} ЕООД`;
      const siteName = `Е2Е Абонамент обект ${suffix}`;
      const eik = uniqueEik(2);

      await login(page, OFFICE.email, OFFICE.password);

      await page.goto("/clients");
      await page.getByRole("button", { name: "Нов клиент" }).click();
      const clientCreate = page.getByRole("dialog", { name: "Нов клиент" });
      await clientCreate.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Фирма" }).click();
      await clientCreate.getByLabel(/Наименование/).fill(clientName);
      await clientCreate.getByLabel(/^ЕИК/).fill(eik);
      await clientCreate.getByRole("button", { name: "Запази" }).click();
      await expect(clientCreate).toHaveCount(0);

      await page.goto("/sites");
      await page.getByRole("button", { name: "Нов обект" }).click();
      const drawer = page.getByRole("dialog");
      const clientSearch = drawer.getByPlaceholder("Име или ЕИК");
      await clientSearch.click();
      await clientSearch.fill(clientName);
      await expect(drawer.getByRole("option").filter({ hasText: clientName })).toBeVisible({
        timeout: 10_000,
      });
      await drawer.getByRole("option").filter({ hasText: clientName }).click();
      await drawer.getByLabel(/Наименование/).fill(siteName);
      await drawer.getByLabel(/^Адрес/).fill(`ул. Абонамент ${suffix}`);
      await drawer.getByRole("button", { name: "Запази" }).click();
      await expect(drawer).toHaveCount(0, { timeout: 15_000 });

      await page.getByLabel("Търсене").fill(siteName);
      await expect(page.getByRole("cell", { name: siteName })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("cell", { name: siteName }).click();

      const edit = page.getByRole("dialog");
      await edit.getByRole("tab", { name: "Абонамент" }).click();
      await expect(edit.getByTestId("subscription-empty")).toBeVisible();

      await edit.getByRole("button", { name: "Нов абонамент" }).click();
      const form = edit.getByTestId("subscription-form");
      await expect(form).toBeVisible();
      await form.locator('input[type="number"]').fill("55");
      await form.locator('input[type="date"]').first().fill("2020-01-01");
      await form.getByRole("button", { name: "Запази" }).click();
      await expect(edit.getByTestId("subscription-current")).toBeVisible({ timeout: 15_000 });

      // End on a fixed past date, then try an overlapping create
      await edit.getByRole("button", { name: "Прекрати абонамента" }).click();
      const endDialog = page.getByRole("alertdialog");
      await expect(endDialog).toBeVisible();
      await endDialog.locator('input[type="date"]').fill("2025-12-31");
      await endDialog.getByRole("button", { name: "Прекрати" }).click();
      await expect(edit.getByTestId("subscription-empty")).toBeVisible({ timeout: 15_000 });
      await expect(edit.getByTestId("subscription-history")).toBeVisible();

      // Overlap: start inside the ended window
      await edit.getByRole("button", { name: "Нов абонамент" }).click();
      const form2 = edit.getByTestId("subscription-form");
      await form2.locator('input[type="number"]').fill("60");
      await form2.locator('input[type="date"]').first().fill("2020-06-01");
      await form2.getByRole("button", { name: "Запази" }).click();
      await expect(
        edit.getByText(/вече има абонамент, който се припокрива/),
      ).toBeVisible({ timeout: 10_000 });

      // Valid new subscription after the ended one
      await form2.locator('input[type="date"]').first().fill("2026-01-01");
      await form2.getByRole("button", { name: "Запази" }).click();
      await expect(edit.getByTestId("subscription-current")).toBeVisible({ timeout: 15_000 });
      await expect(edit.getByTestId("subscription-history")).toBeVisible();

      // Terminate site → subscription ends today
      await edit.getByRole("tab", { name: "Данни" }).click();
      await edit.getByRole("button", { name: "Прекрати обекта" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Потвърди" }).click();
      await expect(edit).toHaveCount(0, { timeout: 15_000 });

      const statusFilter = page.locator("div.space-y-1\\.5").filter({ hasText: /^Статус/ });
      await statusFilter.getByRole("combobox").click();
      await page.getByRole("option", { name: "Прекратени" }).click();
      await page.getByLabel("Търсене").fill(siteName);
      await expect(page.getByRole("cell", { name: siteName })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("cell", { name: siteName }).click();
      const termDrawer = page.getByRole("dialog");
      await termDrawer.getByRole("tab", { name: "Абонамент" }).click();
      // Inclusive end-date = today → still current today; must not stay open-ended.
      const current = termDrawer.getByTestId("subscription-current");
      await expect(current).toBeVisible();
      await expect(current.getByText(/безсрочен/)).toHaveCount(0);
      await expect(current.getByText(/от \d{2}\.\d{2}\.\d{4}/)).toBeVisible();
      await expect(current.getByText(/до \d{2}\.\d{2}\.\d{4}/)).toBeVisible();
    });
  });

  test("FIELD phone: subscription tab is read-only", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, FIELD.email, FIELD.password);
    await page.goto("/sites");
    await expect(page.getByRole("heading", { name: "Обекти" })).toBeVisible({ timeout: 15_000 });

    // List rows are interactive TableRows with role=button.
    const siteRow = page.locator("tbody tr[role='button']").first();
    await expect(siteRow).toBeVisible({ timeout: 15_000 });
    await siteRow.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("tab", { name: "Абонамент" }).click();
    await expect(drawer.getByTestId("subscription-read")).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByRole("button", { name: "Нов абонамент" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Редактирай" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Прекрати абонамента" })).toHaveCount(0);
  });
});
