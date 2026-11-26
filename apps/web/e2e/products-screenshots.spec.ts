import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "../../docs/evidence/task-18/screenshots");
const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

test("capture Task 18 products/visit screenshots at 1440 and 390", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Capture once from desktop project");
  mkdirSync(OUT, { recursive: true });
  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  };

  await login(page, OFFICE.email, OFFICE.password);
  await page.goto("/products");
  await expect(page.getByTestId("products-page")).toBeVisible();
  await shot("products-list-1440.png", 1440, 900);
  await shot("products-list-390.png", 390, 844);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("products-new").click();
  await expect(page.getByTestId("product-drawer")).toBeVisible();
  await shot("products-drawer-1440.png", 1440, 900);
  await page.keyboard.press("Escape");

  const sites = await page.request.get(
    `/api/sites?search=${encodeURIComponent("E2E Мониторинг")}&pageSize=20`,
  );
  const site = (
    (await sites.json()) as { items: Array<{ id: string; name: string }> }
  ).items.find((s) => s.name.includes("Мониторинг"));
  expect(site).toBeTruthy();
  const visits = await page.request.get(`/api/visits?siteId=${site!.id}&pageSize=50`);
  const items = (
    (await visits.json()) as { items: Array<{ id: string; notes: string | null }> }
  ).items;
  const open = items.find((v) => v.notes === "__e2e_products_v1__");
  const frozen = items.find((v) => v.notes === "__e2e_products_v1___frozen");
  expect(open && frozen).toBeTruthy();

  await page.goto(`/visits/${open!.id}/edit`);
  await expect(page.getByTestId("visit-products-panel")).toBeVisible();
  await shot("visit-products-unfrozen-1440.png", 1440, 900);
  await shot("visit-products-unfrozen-390.png", 390, 844);

  await page.goto(`/visits/${frozen!.id}/edit`);
  await expect(page.getByTestId("visit-products-frozen")).toBeVisible();
  await shot("visit-products-frozen-1440.png", 1440, 900);
  await shot("visit-products-frozen-390.png", 390, 844);
});
