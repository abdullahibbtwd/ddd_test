import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/evidence/task-11/screenshots");

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
  await page.route("**/*tile.openstreetmap.org/**", async (route: import("@playwright/test").Route) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
}

test("capture sites screenshots at 1440 and 390", async ({ page, context }, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run",
  );
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await stubOsmTiles(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 42.6977, longitude: 23.3219 });

  const stamp = Date.now();
  const clientName = `Evidence Quick ${stamp}`;
  const siteName = `Evidence Site ${stamp}`;
  const address = `ул. Evidence ${stamp}`;
  const eik = eikFromPrefix(String((40000000 + (stamp % 50000000)) % 100000000).padStart(8, "0"));

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  };

  await login(page, OFFICE);

  // Unique client + first site so duplicate-address UI and Обекти tab are deterministic.
  await page.goto("/clients");
  await page.getByRole("button", { name: "Нов клиент" }).click();
  const clientDrawerCreate = page.getByRole("dialog", { name: "Нов клиент" });
  await clientDrawerCreate.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Фирма" }).click();
  await clientDrawerCreate.getByLabel(/Наименование/).fill(clientName);
  await clientDrawerCreate.getByLabel(/^ЕИК/).fill(eik);
  await clientDrawerCreate.getByRole("button", { name: "Запази" }).click();
  await expect(clientDrawerCreate).toHaveCount(0);
  await page.getByLabel("Търсене").fill(clientName);
  await expect(page.getByRole("cell", { name: clientName, exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/sites");
  await page.getByRole("button", { name: "Нов обект" }).click();
  let siteDrawer = page.getByRole("dialog");
  await siteDrawer.getByPlaceholder("Име или ЕИК").fill(clientName);
  await expect(siteDrawer.getByRole("option").filter({ hasText: clientName })).toBeVisible({
    timeout: 10_000,
  });
  await siteDrawer.getByRole("option").filter({ hasText: clientName }).click();
  await siteDrawer.getByLabel(/Наименование/).fill(siteName);
  await siteDrawer.getByLabel(/^Адрес/).fill(address);
  await siteDrawer.getByRole("button", { name: "Запази" }).click();
  await expect(siteDrawer).toHaveCount(0, { timeout: 15_000 });

  // Sites list
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Обекти" })).toBeVisible();
  await shot("sites-list-1440.png", 1440, 900);
  await shot("sites-list-390.png", 390, 844);

  // Map view
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Карта" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await shot("sites-map-1440.png", 1440, 900);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.waitForTimeout(400);
  await shot("sites-map-390.png", 390, 844);

  // Create drawer with map + address duplicate warning
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Списък" }).click();
  await page.getByRole("button", { name: "Нов обект" }).click();
  siteDrawer = page.getByRole("dialog");
  await expect(siteDrawer).toBeVisible();
  await expect(siteDrawer.locator(".leaflet-container")).toBeVisible();

  const clientSearch = siteDrawer.getByPlaceholder("Име или ЕИК");
  await clientSearch.click();
  await clientSearch.fill(clientName);
  await expect(siteDrawer.getByRole("option").filter({ hasText: clientName })).toBeVisible({
    timeout: 10_000,
  });
  await siteDrawer.getByRole("option").filter({ hasText: clientName }).click();

  await siteDrawer.getByLabel(/^Адрес/).fill(`${address}Б`);
  await expect(siteDrawer.getByText(/Възможен дубликат по адрес/)).toBeVisible({
    timeout: 10_000,
  });
  await siteDrawer.getByRole("button", { name: "Използвай моето местоположение" }).click();
  await page.waitForTimeout(400);
  await siteDrawer.locator(".leaflet-container").scrollIntoViewIfNeeded();
  await shot("site-drawer-create-1440.png", 1440, 900);

  await page.keyboard.press("Escape");
  await expect(siteDrawer).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Нов обект" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot("site-drawer-create-390.png", 390, 844);
  await page.keyboard.press("Escape");

  // Client drawer Обекти tab — find via search filter
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Клиенти" })).toBeVisible();
  await page.getByLabel("Търсене").fill(clientName);
  await expect(page.getByRole("cell", { name: clientName, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("cell", { name: clientName, exact: true }).click();
  const clientDrawer = page.getByRole("dialog");
  await expect(clientDrawer).toBeVisible();
  await clientDrawer.getByRole("button", { name: "Обекти" }).click();
  await page.waitForTimeout(500);
  await shot("client-sites-tab-1440.png", 1440, 900);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Клиенти" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Търсене").fill(clientName);
  await expect(page.getByRole("cell", { name: clientName, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("cell", { name: clientName, exact: true }).click({ force: true });
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Обекти" }).click();
  await page.waitForTimeout(400);
  await shot("client-sites-tab-390.png", 390, 844);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // FIELD quick-add new client on phone
  await page.goto("/login");
  await login(page, FIELD);
  await expect(page).toHaveURL(/\/sites/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Нов обект" }).click();
  const fieldDrawer = page.getByRole("dialog");
  await expect(fieldDrawer).toBeVisible({ timeout: 15_000 });
  await fieldDrawer.locator("section").first().getByRole("button", { name: "Нов клиент" }).click();
  await expect(fieldDrawer.getByText("Тип")).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(300);
  await shot("field-quick-add-390.png", 390, 844);
});
