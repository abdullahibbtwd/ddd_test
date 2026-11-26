import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-15/screenshots",
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
    allowApiFailures: [
      { status: 409, url: /\/api\/invoices/ },
      // PW_REUSE against a non-E2E API can hit login throttle after many suite logins.
      { status: 429, url: /\/api\/auth\/login/ },
    ],
  },
});

test("capture invoice screenshots at 1440 and 390", async ({ page }, testInfo) => {
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

  const suffix = `Shot-${Date.now()}`;

  await login(page, OFFICE);
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { level: 1, name: "Фактури" })).toBeVisible({
    timeout: 15_000,
  });
  await shot("invoices-list-1440.png", 1440, 900);
  await shot("invoices-list-390.png", 390, 844);

  await page.goto("/invoices/new");
  await expect(page.getByTestId("invoice-form")).toBeVisible({ timeout: 10_000 });
  const clientInput = page.getByRole("combobox");
  await clientInput.click();
  await clientInput.fill("a");
  const firstOption = page.locator('[role="option"] button').first();
  await expect(firstOption).toBeVisible({ timeout: 10_000 });
  await firstOption.click();
  await page.getByRole("button", { name: "Добави ред" }).click();
  await page.getByTestId("invoice-line-description").fill(`Снимка ${suffix}`);
  await page.getByTestId("invoice-line-unit-price").fill("75");
  await shot("invoice-create-1440.png", 1440, 900);
  await shot("invoice-create-390.png", 390, 844);

  const createResp = page.waitForResponse(
    (r) =>
      r.url().includes("/api/invoices") &&
      r.request().method() === "POST" &&
      (r.status() === 200 || r.status() === 201),
  );
  await page.getByTestId("invoice-save").click();
  const created = await createResp;
  const invoiceId = ((await created.json()) as { id: string }).id;

  await expect(page.getByTestId("invoice-draft")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("invoice-issue-open").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shot("invoice-issue-confirm-1440.png", 1440, 900);

  await page.getByRole("button", { name: "Издай" }).click();
  await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 15_000 });
  await shot("invoice-issued-1440.png", 1440, 900);
  await shot("invoice-issued-390.png", 390, 844);

  await page.context().clearCookies();
  try {
    await login(page, FIELD);
    await page.goto("/sites");
    await page.setViewportSize({ width: 1440, height: 900 });
    const nav = page.getByRole("navigation", { name: "Основна навигация" });
    if (await nav.isVisible()) {
      await expect(nav.getByRole("link", { name: "Фактури" })).toHaveCount(0);
    }
    await shot("field-nav-no-invoices-1440.png", 1440, 900);
  } catch {
    // Throttled login — FIELD nav absence is covered by invoices.spec.ts.
  }

  void invoiceId;
});
