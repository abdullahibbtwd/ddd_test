import { expect, test, type Page } from "./fixtures.js";

/**
 * Task 17 Playwright: OFFICE payments / cash; FIELD nav + cash.
 * Deterministic e2e invoice numbers 0000009000 / 9001 / 9002 from seed.
 */

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

async function invoiceIdByNumber(page: Page, number: string): Promise<string> {
  // Paginate API until the seeded number appears (list is not searchable).
  for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
    const res = await page.request.get(
      `/api/invoices?page=${pageNo}&pageSize=50`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      items: Array<{ id: string; number: string | null }>;
      total: number;
    };
    const hit = body.items.find((i) => i.number === number);
    if (hit) return hit.id;
    if (pageNo * 50 >= body.total) break;
  }
  throw new Error(`Invoice ${number} not found in list API`);
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

test.describe("payments OFFICE 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("add partial payment, reminder, outstanding, cash handover", async ({
    page,
  }) => {
    await login(page, OFFICE.email, OFFICE.password);

    const id9000 = await invoiceIdByNumber(page, "0000009000");
    await page.goto(`/invoices/${id9000}`);
    await expect(page.getByTestId("invoice-payments-section")).toBeVisible();
    await page.getByTestId("invoice-add-payment").click();
    await page.getByTestId("payment-amount").fill("10.00");
    await page.getByTestId("payment-method").click();
    await page.getByRole("option", { name: "Банков превод" }).click();
    await page.getByTestId("payment-save").click();
    await expect(page.getByTestId("invoice-outstanding-line")).toBeVisible();

    const id9001 = await invoiceIdByNumber(page, "0000009001");
    await page.goto(`/invoices/${id9001}`);
    await page.getByTestId("invoice-send-reminder").click();
    await page.getByRole("button", { name: "Изпрати" }).click();

    await page.goto("/payments");
    await expect(page.getByTestId("payments-outstanding")).toBeVisible();

    await page.goto("/cash");
    await expect(page.getByTestId("cash-ledger")).toBeVisible();
    await page.getByTestId("cash-handover-open").click();
    await page.getByTestId("handover-amount").fill("5.00");
  });
});

test.describe("payments OFFICE 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("outstanding and cash stack; one payment", async ({ page }) => {
    await login(page, OFFICE.email, OFFICE.password);
    await page.goto("/payments");
    await expect(page.getByTestId("payments-outstanding")).toBeVisible();
    await page.goto("/cash");
    await expect(page.getByTestId("cash-ledger")).toBeVisible();
  });
});

test.describe("payments FIELD 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("visit payment button states", async ({ page }) => {
    await login(page, FIELD.email, FIELD.password);
    await page.goto("/sites");
    await expect(page.getByRole("heading", { level: 1, name: "Обекти" })).toBeVisible({
      timeout: 15_000,
    });

    const nav = await visibleNav(page);
    await expect(nav.getByRole("link", { name: "Плащания" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Каса" })).toBeVisible();
  });
});

test.afterAll(() => {
  console.log("payments Playwright groups: OFFICE1440=1 OFFICE390=1 FIELD390=1");
});
