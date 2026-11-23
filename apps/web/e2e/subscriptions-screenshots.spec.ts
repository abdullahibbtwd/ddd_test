import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-12/screenshots",
);

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

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(creds.email);
  await page.getByLabel("Парола").fill(creds.password);
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

test("capture subscription tab screenshots at 1440 and 390", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run",
  );
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await stubOsmTiles(page);

  const stamp = Date.now();
  const clientName = `Sub Evidence ${stamp}`;
  const siteName = `Sub Evidence Site ${stamp}`;
  const eik = eikFromPrefix(String((41000000 + (stamp % 50000000)) % 100000000).padStart(8, "0"));

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  };

  await login(page, OFFICE);

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
  const createDrawer = page.getByRole("dialog");
  const clientSearch = createDrawer.getByPlaceholder("Име или ЕИК");
  await clientSearch.click();
  await clientSearch.fill(clientName);
  await expect(createDrawer.getByRole("option").filter({ hasText: clientName })).toBeVisible({
    timeout: 10_000,
  });
  await createDrawer.getByRole("option").filter({ hasText: clientName }).click();
  await createDrawer.getByLabel(/Наименование/).fill(siteName);
  await createDrawer.getByLabel(/^Адрес/).fill(`ул. Evidence Sub ${stamp}`);
  await createDrawer.getByRole("button", { name: "Запази" }).click();
  await expect(createDrawer).toHaveCount(0, { timeout: 15_000 });

  await page.getByLabel("Търсене").fill(siteName);
  await page.getByRole("cell", { name: siteName }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("tab", { name: "Абонамент" }).click();

  await expect(drawer.getByTestId("subscription-empty")).toBeVisible();
  await shot("subscription-empty-1440.png", 1440, 900);
  await shot("subscription-empty-390.png", 390, 844);

  await drawer.getByRole("button", { name: "Нов абонамент" }).click();
  const form = drawer.getByTestId("subscription-form");
  await expect(form).toBeVisible();
  await shot("subscription-form-1440.png", 1440, 900);
  await shot("subscription-form-390.png", 390, 844);

  await form.locator('input[type="number"]').fill("55");
  await form.locator('input[type="date"]').first().fill("2020-01-01");
  await form.getByRole("button", { name: "Запази" }).click();
  await expect(drawer.getByTestId("subscription-current")).toBeVisible({ timeout: 15_000 });
  await shot("subscription-current-1440.png", 1440, 900);
  await shot("subscription-current-390.png", 390, 844);

  await drawer.getByRole("button", { name: "Прекрати абонамента" }).click();
  await page.getByRole("alertdialog").locator('input[type="date"]').fill("2025-12-31");
  await page.getByRole("alertdialog").getByRole("button", { name: "Прекрати" }).click();
  await expect(drawer.getByTestId("subscription-empty")).toBeVisible({ timeout: 15_000 });

  await drawer.getByRole("button", { name: "Нов абонамент" }).click();
  const form2 = drawer.getByTestId("subscription-form");
  await form2.locator('input[type="number"]').fill("70");
  await form2.locator('input[type="date"]').first().fill("2026-01-01");
  await form2.getByRole("button", { name: "Запази" }).click();
  await expect(drawer.getByTestId("subscription-current")).toBeVisible({ timeout: 15_000 });
  await expect(drawer.getByTestId("subscription-history")).toBeVisible();
  await shot("subscription-history-1440.png", 1440, 900);
  await shot("subscription-history-390.png", 390, 844);
});
