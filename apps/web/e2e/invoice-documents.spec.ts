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

async function findInvoiceIdByNumber(page: Page, number: string): Promise<string> {
  for (let pageNo = 1; pageNo <= 20; pageNo++) {
    const res = await page.request.get(`/api/invoices?page=${pageNo}&pageSize=50`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      items: Array<{ id: string; number: string | null }>;
      total: number;
    };
    const hit = body.items.find((i) => i.number === number);
    if (hit) return hit.id;
    if (pageNo * 50 >= body.total) break;
  }
  throw new Error(`Invoice ${number} not found`);
}

test.describe("invoice documents (Task 16)", () => {
  test.describe("OFFICE documents + batch", () => {
    test.use({
      consoleGuard: {
        allowApiFailures: [
          { status: 409, url: /\/api\/invoices/ },
          { status: 429, url: /\/api\/auth\/login/ },
        ],
      },
    });

    test("desktop: PDF, email, credit note 0101, batch dryRun/create/issue", async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name === "phone-390",
        "intentional: full OFFICE documents flow on desktop",
      );
      test.setTimeout(240_000);

      await login(page, OFFICE.email, OFFICE.password);

      const invoiceId = await findInvoiceIdByNumber(page, "0000000100");
      await page.goto(`/invoices/${invoiceId}`);
      await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 15_000 });

      // Prefer API assertion — <a download> may not surface as a page response in PW.
      const pdf = await page.request.get(`/api/invoices/${invoiceId}/pdf?copy=0`);
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toMatch(/application\/pdf/);
      expect(pdf.headers()["content-disposition"] ?? "").toMatch(/filename/i);
      await expect(page.getByTestId("invoice-pdf-original")).toHaveAttribute(
        "href",
        `/api/invoices/${invoiceId}/pdf?copy=0`,
      );

      await page.getByTestId("invoice-email-open").click();
      await page.getByTestId("invoice-email-to").fill("docs-e2e@example.com");
      const emailRespPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/invoices/${invoiceId}/email`) &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Изпрати" }).click();
      const emailRes = await emailRespPromise;
      expect(emailRes.status()).toBe(202);
      await expect(page.getByTestId("invoice-email-queued")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("invoice-email-history")).toBeVisible();
      await expect(page.getByTestId("invoice-email-history")).toContainText("docs-e2e@example.com");

      await page.getByTestId("invoice-credit-note").click();
      await expect(page.getByTestId("credit-note-form")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("credit-note-reason").fill("E2E корекция на сума");
      await page.getByTestId("credit-note-issue").click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      const creditRespPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/invoices/${invoiceId}/credit-note`) &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Издай кредитно известие" })
        .click();
      const creditRes = await creditRespPromise;
      expect([200, 201]).toContain(creditRes.status());
      const creditBody = (await creditRes.json()) as { id: string; number: string };
      expect(creditBody.number).toBe("0000000101");

      await expect(page).toHaveURL(new RegExp(`/invoices/${creditBody.id}`), {
        timeout: 15_000,
      });

      await page.goto(`/invoices/${invoiceId}`);
      await expect(page.getByTestId("invoice-cancelled-banner")).toBeVisible({ timeout: 15_000 });

      await page.goto(`/invoices/${creditBody.id}`);
      await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 10_000 });
      const creditPdf = await page.request.get(
        `/api/invoices/${creditBody.id}/pdf?copy=0`,
      );
      expect(creditPdf.status()).toBe(200);

      await page.goto("/invoices");
      await page.getByTestId("batch-invoicing-open").click();
      await expect(page.getByTestId("batch-drawer")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("batch-month").fill("2026-09");

      const dryPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/invoices/batch") &&
          r.request().method() === "POST" &&
          !r.url().includes("issue"),
      );
      await page.getByTestId("batch-preview").click();
      const dry = await dryPromise;
      expect([200, 201]).toContain(dry.status());
      const dryBody = (await dry.json()) as { created: number; skipped: number };
      await expect(page.getByTestId("batch-plan")).toBeVisible();

      if (dryBody.created > 0) {
        const createPromise = page.waitForResponse(
          (r) =>
            r.url().includes("/api/invoices/batch") &&
            r.request().method() === "POST" &&
            !r.url().includes("issue"),
        );
        await page.getByTestId("batch-create").click();
        const created = await createPromise;
        const createdBody = (await created.json()) as {
          created: number;
          createdIds?: string[];
        };
        expect(createdBody.created).toBeGreaterThan(0);
        await expect(page.getByTestId("batch-created-list")).toBeVisible({ timeout: 10_000 });

        const issuePromise = page.waitForResponse(
          (r) =>
            r.url().includes("/api/invoices/batch/issue") &&
            r.request().method() === "POST",
        );
        await page.getByTestId("batch-issue").click();
        await issuePromise;
        await expect(page.getByTestId("batch-issue-results")).toBeVisible({ timeout: 15_000 });
      }
    });
  });

  test.describe("FIELD forbidden on invoice detail", () => {
    test("direct /invoices/:id redirects home", async ({ page }) => {
      await login(page, FIELD.email, FIELD.password);
      await page.goto("/invoices/01a20d45-0000-7000-8000-000000000099");
      await expect(page).not.toHaveURL(/\/invoices\//);
      await expect(page).toHaveURL(/\/sites/);
    });
  });
});
