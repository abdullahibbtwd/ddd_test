import { expect, test, type Page } from "./fixtures.js";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };

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
  const base = (30000000 + (Date.now() % 60000000) + n * 41) % 100000000;
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
  await page.route("**/*tile.openstreetmap.org/**", async (route: import("@playwright/test").Route) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
}

async function visibleNav(page: Page, isPhone: boolean) {
  if (isPhone) {
    await page.getByRole("button", { name: "Отвори менюто" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog.getByRole("navigation", { name: "Основна навигация" });
  }
  return page.getByRole("navigation", { name: "Основна навигация" });
}

async function clickMapCenter(map: ReturnType<Page["locator"]>) {
  await expect(map).toBeVisible({ timeout: 15_000 });
  // Click relative to the Leaflet container (page.mouse + bbox misses pane hit-testing).
  const box = await map.boundingBox();
  expect(box).toBeTruthy();
  await map.click({
    position: { x: Math.floor(box!.width / 2), y: Math.floor(box!.height / 2) },
  });
}

test.describe("sites", () => {
  test.beforeEach(async ({ page, context }) => {
    await stubOsmTiles(page);
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 42.6977, longitude: 23.3219 });
  });

  test.describe("OFFICE site lifecycle", () => {
    test.use({
      consoleGuard: {
        allowApiFailures: [
          // Archive while active sites remain → CLIENT_HAS_ACTIVE_SITES
          { status: 409, url: /\/api\/clients\// },
        ],
      },
    });

  test("OFFICE: create site, map coords, duplicate address, terminate/reactivate, client sites, archive block", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "phone-390",
      "intentional: Task 11 OFFICE acceptance flow is desktop-only",
    );
    test.setTimeout(180_000);

    const suffix = `T11-${Date.now()}`;
    const clientName = `Е2Е Обекти Клиент ${suffix} ЕООД`;
    const siteA = `Е2Е Обект А ${suffix}`;
    const siteB = `Е2Е Обект Б ${suffix}`;
    const address = `ул. Дубликат ${suffix} 1`;
    const eik = uniqueEik(1);

    await login(page, OFFICE.email, OFFICE.password);

    // Existing client for the site flow
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Клиенти" })).toBeVisible();
    await page.getByRole("button", { name: "Нов клиент" }).click();
    const clientCreate = page.getByRole("dialog", { name: "Нов клиент" });
    await clientCreate.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Фирма" }).click();
    await clientCreate.getByLabel(/Наименование/).fill(clientName);
    await clientCreate.getByLabel(/^ЕИК/).fill(eik);
    await clientCreate.getByRole("button", { name: "Запази" }).click();
    await expect(clientCreate).toHaveCount(0);
    await page.getByLabel("Търсене").fill(clientName);
    await expect(page.getByRole("cell", { name: clientName, exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Create first site — map click sets coordinates
    await page.goto("/sites");
    await expect(page.getByRole("heading", { name: "Обекти" })).toBeVisible();
    await page.getByRole("button", { name: "Нов обект" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    const clientSearch = drawer.getByPlaceholder("Име или ЕИК");
    await clientSearch.click();
    await clientSearch.fill(clientName);
    await expect(drawer.getByRole("option").filter({ hasText: clientName })).toBeVisible({
      timeout: 10_000,
    });
    await drawer.getByRole("option").filter({ hasText: clientName }).click();

    await drawer.getByLabel(/Наименование/).fill(siteA);
    await drawer.getByLabel(/^Адрес/).fill(address);
    await clickMapCenter(drawer.locator(".leaflet-container"));
    await expect(drawer.locator(".font-mono").first()).not.toHaveText("—", { timeout: 10_000 });
    await expect(drawer.locator(".font-mono").first()).toHaveText(/\d+\.\d+,\s*\d+\.\d+/);
    await drawer.getByRole("button", { name: "Запази" }).click();
    await expect(drawer).toHaveCount(0, { timeout: 15_000 });

    await page.getByLabel("Търсене").fill(siteA);
    // Site cell includes client name underneath — match by site name, not exact full cell.
    await expect(page.getByRole("cell", { name: siteA })).toBeVisible({ timeout: 15_000 });

    // Second site, similar address → duplicate warning, still save
    await page.getByRole("button", { name: "Нов обект" }).click();
    const drawer2 = page.getByRole("dialog");
    const clientSearch2 = drawer2.getByPlaceholder("Име или ЕИК");
    await clientSearch2.click();
    await clientSearch2.fill(clientName);
    await expect(drawer2.getByRole("option").filter({ hasText: clientName })).toBeVisible({
      timeout: 10_000,
    });
    await drawer2.getByRole("option").filter({ hasText: clientName }).click();
    await drawer2.getByLabel(/Наименование/).fill(siteB);
    await drawer2.getByLabel(/^Адрес/).fill(`${address}А`);
    await expect(drawer2.getByText(/Възможен дубликат по адрес/)).toBeVisible({ timeout: 10_000 });
    await drawer2.getByRole("button", { name: "Запази" }).click();
    await expect(drawer2).toHaveCount(0, { timeout: 15_000 });

    // Terminate site A
    await page.getByLabel("Търсене").fill(siteA);
    await page.getByRole("cell", { name: siteA }).click();
    const editDrawer = page.getByRole("dialog");
    await editDrawer.getByRole("button", { name: "Прекрати обекта" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Потвърди" }).click();
    await expect(editDrawer).toHaveCount(0, { timeout: 15_000 });

    // Find under Прекратени
    const statusFilter = page.locator("div.space-y-1\\.5").filter({ hasText: /^Статус/ });
    await statusFilter.getByRole("combobox").click();
    await page.getByRole("option", { name: "Прекратени" }).click();
    await page.getByLabel("Търсене").fill(siteA);
    await expect(page.getByRole("cell", { name: siteA })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("cell", { name: siteA }).click();
    const termDrawer = page.getByRole("dialog");
    await termDrawer.getByRole("button", { name: "Активирай обекта" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Потвърди" }).click();
    await expect(termDrawer).toHaveCount(0, { timeout: 15_000 });

    await statusFilter.getByRole("combobox").click();
    await page.getByRole("option", { name: "Активни" }).click();
    await page.getByLabel("Търсене").fill(siteA);
    await expect(page.getByRole("cell", { name: siteA })).toBeVisible({ timeout: 15_000 });

    // Client Обекти tab + map view
    await page.goto("/clients");
    await page.getByLabel("Търсене").fill(clientName);
    await page.getByRole("cell", { name: clientName, exact: true }).click();
    const clientDrawer = page.getByRole("dialog");
    await clientDrawer.getByRole("button", { name: "Обекти" }).click();
    await expect(clientDrawer.getByText(siteA)).toBeVisible({ timeout: 10_000 });
    await expect(clientDrawer.getByText(siteB)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/sites");
    await page.getByRole("button", { name: "Карта" }).click();
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Списък" }).click();

    // Archive blocked while site is active
    await page.goto("/clients");
    await page.getByLabel("Търсене").fill(clientName);
    await page.getByRole("cell", { name: clientName, exact: true }).click();
    const archiveDrawer = page.getByRole("dialog");
    await archiveDrawer.getByRole("button", { name: "Данни" }).click();
    await archiveDrawer.getByRole("button", { name: "Архивирай" }).click();
    await page.getByRole("button", { name: "Потвърди" }).click();
    await expect(
      page.getByText("Клиентът има активни обекти и не може да бъде архивиран."),
    ).toBeVisible({ timeout: 10_000 });
  });
  });

  test("FIELD: home is /sites; no clients or settings in nav", async ({ page }, testInfo) => {
    const isPhone = testInfo.project.name === "phone-390";
    await login(page, FIELD.email, FIELD.password);
    await expect(page).toHaveURL(/\/sites/);
    await expect(page.getByRole("heading", { name: "Обекти" })).toBeVisible();

    const nav = await visibleNav(page, isPhone);
    await expect(nav.getByRole("link", { name: "Обекти" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Клиенти" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Настройки" })).toHaveCount(0);
  });

  test("ADMIN: manages site types", async ({ page }) => {
    const typeName = `E2E вид ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/settings/site-types");
    await expect(page.getByRole("tab", { name: "Видове обекти" })).toBeVisible();
    await page.getByRole("button", { name: "Нов вид" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("textbox").first().fill(typeName);
    await drawer.getByRole("button", { name: "Запази" }).click();
    await expect(drawer).toHaveCount(0, { timeout: 15_000 });
    // Site types have no search filter; find by unique name (not list position).
    await expect(page.getByRole("cell", { name: typeName, exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
