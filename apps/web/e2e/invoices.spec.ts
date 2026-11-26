import { expect, test, type Page } from "./fixtures.js";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

test.describe("invoices", () => {
  test.describe("OFFICE create + issue", () => {
    test.use({
      consoleGuard: {
        allowApiFailures: [{ status: 409, url: /\/api\/invoices/ }],
      },
    });

    test("desktop: draft with 2 visits, totals, issue, readonly, PATCH 409", async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name === "phone-390",
        "intentional: full OFFICE invoice flow on desktop; phone has condensed case",
      );
      test.setTimeout(180_000);

      const suffix = `T15-${Date.now()}`;

      await login(page, OFFICE.email, OFFICE.password);
      await page.goto("/invoices");
      await expect(page.getByRole("heading", { level: 1, name: "Фактури" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("link", { name: "Нова фактура" }).click();
      await expect(page.getByTestId("invoice-form")).toBeVisible({ timeout: 10_000 });

      // Pick first available client from search.
      const clientInput = page.getByRole("combobox");
      await clientInput.click();
      await clientInput.fill("E2E");
      const firstOption = page.locator('[role="option"] button').first();
      await expect(firstOption).toBeVisible({ timeout: 10_000 });
      const clientName = ((await firstOption.textContent()) ?? "").trim();
      await firstOption.click();
      expect(clientName.length).toBeGreaterThan(0);

      // Wait for visits checklist (may be empty if client has none — then add manual lines).
      await expect(page.getByTestId("invoice-visits")).toBeVisible({ timeout: 10_000 });
      const visitBoxes = page.getByTestId("invoice-visits").locator('button[role="checkbox"]');
      const visitCount = await visitBoxes.count();
      if (visitCount >= 2) {
        await visitBoxes.nth(0).click();
        await visitBoxes.nth(1).click();
        await expect(page.getByTestId("invoice-line-description")).toHaveCount(2);
      } else {
        await page.getByRole("button", { name: "Добави ред" }).click();
        await page.getByTestId("invoice-line-description").fill(`Услуга ${suffix} A`);
        await page.getByTestId("invoice-line-unit-price").fill("100");
        await page.getByRole("button", { name: "Добави ред" }).click();
        await page.getByTestId("invoice-line-description").nth(1).fill(`Услуга ${suffix} B`);
        await page.getByTestId("invoice-line-unit-price").nth(1).fill("50");
      }

      await expect(page.getByTestId("invoice-totals")).toBeVisible();
      const totalsText = await page.getByTestId("invoice-totals").textContent();
      expect(totalsText).toMatch(/\d/);

      const createResp = page.waitForResponse(
        (r) =>
          r.url().includes("/api/invoices") &&
          r.request().method() === "POST" &&
          (r.status() === 200 || r.status() === 201),
      );
      await page.getByTestId("invoice-save").click();
      const created = await createResp;
      const invoiceId = ((await created.json()) as { id: string }).id;

      await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}`));
      await expect(page.getByTestId("invoice-draft")).toBeVisible({ timeout: 10_000 });

      await page.getByTestId("invoice-issue-open").click();
      await expect(
        page.getByText(
          "След издаване фактурата не може да се променя. Номерът ще бъде зададен при издаването.",
        ),
      ).toBeVisible();
      const issueResp = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/invoices/${invoiceId}/issue`) &&
          r.request().method() === "POST" &&
          r.status() === 200,
      );
      await page.getByRole("button", { name: "Издай" }).click();
      const issued = await issueResp;
      const number = ((await issued.json()) as { number: string }).number;
      expect(number).toMatch(/^\d{10}$/);

      await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("invoice-issued").locator(".font-mono").first()).toHaveText(
        number,
      );
      await expect(page.getByTestId("invoice-form")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Запази като чернова" })).toHaveCount(0);

      // Reopen issued → still read-only.
      await page.goto(`/invoices/${invoiceId}`);
      await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("invoice-form")).toHaveCount(0);

      // PATCH issued → 409 (immutable / already issued).
      const patchStatus = await page.evaluate(async (id) => {
        const res = await fetch(`/api/invoices/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notes: "hack" }),
        });
        return res.status;
      }, invoiceId);
      expect([409, 422]).toContain(patchStatus);
    });

    test("phone: condensed create + issue + readonly", async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "phone-390",
        "intentional: condensed phone invoice path",
      );
      test.setTimeout(180_000);
      const suffix = `T15p-${Date.now()}`;

      await login(page, OFFICE.email, OFFICE.password);
      await page.goto("/invoices/new");
      await expect(page.getByTestId("invoice-form")).toBeVisible({ timeout: 10_000 });

      const clientInput = page.getByRole("combobox");
      await clientInput.click();
      await clientInput.fill("a");
      const firstOption = page.locator('[role="option"] button').first();
      await expect(firstOption).toBeVisible({ timeout: 10_000 });
      await firstOption.click();

      await page.getByRole("button", { name: "Добави ред" }).click();
      await page.getByTestId("invoice-line-description").fill(`Телефон ${suffix}`);
      await page.getByTestId("invoice-line-unit-price").fill("40");

      const createResp = page.waitForResponse(
        (r) =>
          r.url().includes("/api/invoices") &&
          r.request().method() === "POST" &&
          (r.status() === 200 || r.status() === 201),
      );
      await page.getByTestId("invoice-save").click();
      const created = await createResp;
      const invoiceId = ((await created.json()) as { id: string }).id;

      await page.getByTestId("invoice-issue-open").click();
      await page.getByRole("button", { name: "Издай" }).click();
      await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("invoice-form")).toHaveCount(0);

      await page.goto(`/invoices/${invoiceId}`);
      await expect(page.getByTestId("invoice-issued")).toBeVisible();
    });
  });

  test.describe("FIELD forbidden", () => {
    test("nav hidden and /invoices redirects home", async ({ page }) => {
      await login(page, FIELD.email, FIELD.password);
      await page.goto("/sites");
      await expect(page.getByRole("heading", { level: 1, name: "Обекти" })).toBeVisible({
        timeout: 15_000,
      });

      const nav = page.getByRole("navigation", { name: "Основна навигация" });
      // Desktop nav may be hidden on phone — check menu or side nav when visible.
      if (await nav.isVisible()) {
        await expect(nav.getByRole("link", { name: "Фактури" })).toHaveCount(0);
      } else {
        await page.getByRole("button", { name: "Отвори менюто" }).click();
        const drawer = page.getByRole("dialog");
        await expect(drawer.getByRole("link", { name: "Фактури" })).toHaveCount(0);
        await page.keyboard.press("Escape");
      }

      await page.goto("/invoices");
      await expect(page).not.toHaveURL(/\/invoices/);
      await expect(page).toHaveURL(/\/sites/);
    });
  });
});
