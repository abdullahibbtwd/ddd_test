import { expect, test, type Page } from "./fixtures.js";

/**
 * Task 18 Playwright: products, visit products/checks, service report, frozen state.
 */

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const E2E_SITE_NAME = "E2E Мониторинг Обект";
const E2E_OPEN_NOTES = "__e2e_products_v1__";
const E2E_FROZEN_NOTES = "__e2e_products_v1___frozen";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

/** Desktop: sidebar visible. Narrow: open the menu drawer first. */
async function visibleNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Основна навигация" });
  if (await nav.isVisible()) return nav;
  await page.getByRole("button", { name: "Отвори менюто" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog.getByRole("navigation", { name: "Основна навигация" });
}

async function findE2eSiteId(page: Page): Promise<string> {
  const res = await page.request.get(
    `/api/sites?search=${encodeURIComponent(E2E_SITE_NAME)}&pageSize=50`,
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    items: Array<{ id: string; name: string }>;
  };
  const hit = body.items.find((s) => s.name === E2E_SITE_NAME);
  if (!hit) throw new Error(`E2E monitoring site not found`);
  return hit.id;
}

async function findVisitIdByNotes(page: Page, notes: string): Promise<string> {
  const scope = await findE2eSiteId(page);
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await page.request.get(
      `/api/visits?siteId=${scope}&page=${pageNo}&pageSize=50`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      items: Array<{ id: string; notes: string | null }>;
      total: number;
    };
    const hit = body.items.find((v) => v.notes === notes);
    if (hit) return hit.id;
    if (pageNo * 50 >= body.total) break;
  }
  throw new Error(`Visit with notes ${notes} not found`);
}

test.describe("products OFFICE 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("create product, visit products/checks, report PDF, frozen disabled", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page, OFFICE.email, OFFICE.password);
    await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible({
      timeout: 15_000,
    });

    const nav = await visibleNav(page);
    await nav.getByRole("link", { name: "Препарати" }).click();
    await expect(page.getByTestId("products-page")).toBeVisible();

    const unique = `E2E-P18-${Date.now()}`;
    await page.getByTestId("products-new").click();
    await page.getByTestId("product-name").fill(unique);
    await page.getByTestId("product-substances").fill("тест-вещество");
    await page.getByTestId("product-save").click();
    // List is paginated — search so the new row is on the first page.
    await page.getByTestId("products-search").fill(unique);
    await expect(page.getByText(unique)).toBeVisible({ timeout: 10_000 });

    const openVisitId = await findVisitIdByNotes(page, E2E_OPEN_NOTES);
    await page.goto(`/visits/${openVisitId}/edit`);
    await expect(page.getByTestId("visit-products-panel")).toBeVisible();
    await page.getByTestId("visit-add-product").click();
    await expect(page.getByTestId("visit-product-drawer")).toBeVisible();
    await page.getByTestId("visit-product-picker").click();
    await page.getByRole("option", { name: unique }).click();
    await page.getByTestId("visit-product-quantity").fill("1.5");
    await page.getByTestId("visit-product-save").click();

    if (await page.getByTestId("visit-mark-checks").isVisible()) {
      await page.getByTestId("visit-mark-checks").click();
      await page.getByTestId("visit-checks-save").click();
    }

    const report = await page.request.get(
      `/api/visits/${openVisitId}/service-report?copy=0`,
    );
    expect(report.status()).toBe(200);
    expect(report.headers()["content-type"]).toContain("application/pdf");
    const buf = Buffer.from(await report.body());
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");

    const frozenId = await findVisitIdByNotes(page, E2E_FROZEN_NOTES);
    await page.goto(`/visits/${frozenId}/edit`);
    await expect(page.getByTestId("visit-products-frozen")).toBeVisible();
    await expect(page.getByTestId("visit-add-product")).toHaveCount(0);
  });
});

test.describe("products OFFICE 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("product drawer, visit product add, report download", async ({ page }) => {
    await login(page, OFFICE.email, OFFICE.password);
    await page.goto("/products");
    await page.getByTestId("products-new").click();
    await expect(page.getByTestId("product-drawer")).toBeVisible();
    await page.getByTestId("product-name").fill(`E2E-P18-390-${Date.now()}`);
    await page.getByTestId("product-save").click();

    const openVisitId = await findVisitIdByNotes(page, E2E_OPEN_NOTES);
    await page.goto(`/visits/${openVisitId}/edit`);
    await expect(page.getByTestId("visit-download-report")).toBeVisible();
    const report = await page.request.get(
      `/api/visits/${openVisitId}/service-report?copy=0`,
    );
    expect(report.status()).toBe(200);
    expect(Buffer.from(await report.body()).subarray(0, 4).toString()).toBe("%PDF");
  });
});

test.describe("products FIELD 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("own visit product/checks/report; frozen disabled", async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, FIELD.email, FIELD.password);
    await expect(page.getByRole("heading", { level: 1, name: "Обекти" })).toBeVisible({
      timeout: 15_000,
    });

    const nav = await visibleNav(page);
    await expect(nav.getByRole("link", { name: "Препарати" })).toHaveCount(0);

    const openVisitId = await findVisitIdByNotes(page, E2E_OPEN_NOTES);
    await page.goto(`/visits/${openVisitId}/edit`);
    await expect(page.getByTestId("visit-products-panel")).toBeVisible();
    await page.getByTestId("visit-add-product").click();
    await page.getByTestId("visit-product-picker").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("visit-product-quantity").fill("0.5");
    await page.getByTestId("visit-product-save").click();

    const report = await page.request.get(
      `/api/visits/${openVisitId}/service-report?copy=0`,
    );
    expect(report.ok()).toBeTruthy();

    const frozenId = await findVisitIdByNotes(page, E2E_FROZEN_NOTES);
    await page.goto(`/visits/${frozenId}/edit`);
    await expect(page.getByTestId("visit-products-frozen")).toBeVisible();
    await expect(page.getByTestId("visit-add-product")).toHaveCount(0);
  });
});

test.afterAll(() => {
  console.log("products Playwright groups: OFFICE1440=1 OFFICE390=1 FIELD390=1");
});
