import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-16/screenshots",
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
      { status: 429, url: /\/api\/auth\/login/ },
    ],
  },
});

test("capture Task 16 invoice document screenshots at 1440 and 390", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run",
  );
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  };

  await login(page, OFFICE);

  // Issued view with actions (prefer 0000000100, else first issued).
  // Paginate — shared e2e DB can have many rows ahead of the seeded 0100.
  let issuedId: string | null = null;
  let anyIssuedId: string | null = null;
  for (let pageNo = 1; pageNo <= 40; pageNo += 1) {
    const list = await page.request.get(`/api/invoices?page=${pageNo}&pageSize=50`);
    expect(list.ok()).toBeTruthy();
    const listBody = (await list.json()) as {
      items: Array<{ id: string; number: string | null; status: string; documentType?: string }>;
      total: number;
    };
    const by100 = listBody.items.find((i) => i.number === "0000000100");
    if (by100) {
      issuedId = by100.id;
      break;
    }
    if (!anyIssuedId) {
      const anyIssued = listBody.items.find(
        (i) => i.status === "ISSUED" || i.status === "CANCELLED_BY_CREDIT_NOTE",
      );
      if (anyIssued) anyIssuedId = anyIssued.id;
    }
    if (pageNo * 50 >= listBody.total) break;
  }
  issuedId = issuedId ?? anyIssuedId;
  expect(issuedId).toBeTruthy();

  await page.goto(`/invoices/${issuedId}`);
  await expect(page.getByTestId("invoice-issued")).toBeVisible({ timeout: 15_000 });
  await shot("issued-actions-1440.png", 1440, 900);
  await shot("issued-actions-390.png", 390, 844);

  await page.getByTestId("invoice-email-open").click();
  await expect(page.getByTestId("invoice-email-to")).toBeVisible();
  await shot("email-dialog-1440.png", 1440, 900);
  await page.keyboard.press("Escape");

  if (await page.getByTestId("invoice-email-history").isVisible()) {
    await shot("email-history-1440.png", 1440, 900);
    await shot("email-history-390.png", 390, 844);
  }

  // Credit / debit forms — prefer seeded 0000000100 while still ISSUED
  const detail = await page.request.get(`/api/invoices/${issuedId}`);
  const detailBody = (await detail.json()) as {
    id: string;
    status: string;
    documentType?: string;
  };
  let noteFallbackId: string | null = null;
  if (!(detailBody.status === "ISSUED" && detailBody.documentType !== "CREDIT_NOTE")) {
    const fallbackList = await page.request.get(`/api/invoices?page=1&pageSize=50`);
    const fallbackBody = (await fallbackList.json()) as {
      items: Array<{ id: string; status: string }>;
    };
    noteFallbackId = fallbackBody.items.find((i) => i.status === "ISSUED")?.id ?? null;
  }
  const noteTargetId =
    detailBody.status === "ISSUED" && detailBody.documentType !== "CREDIT_NOTE"
      ? issuedId!
      : noteFallbackId;
  if (noteTargetId) {
    await page.goto(`/invoices/${noteTargetId}/credit-note`);
    await expect(page.getByTestId("credit-note-form")).toBeVisible({ timeout: 15_000 });
    await shot("credit-note-form-1440.png", 1440, 900);
    await shot("credit-note-form-390.png", 390, 844);

    await page.goto(`/invoices/${noteTargetId}/debit-note`);
    await expect(page.getByTestId("debit-note-form")).toBeVisible({ timeout: 15_000 });
    await shot("debit-note-form-1440.png", 1440, 900);
    await shot("debit-note-form-390.png", 390, 844);
  }

  await page.goto("/invoices");
  await page.getByTestId("batch-invoicing-open").click();
  await expect(page.getByTestId("batch-drawer")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("batch-month").fill("2026-09");
  await shot("batch-drawer-plan-1440.png", 1440, 900);
  await shot("batch-drawer-plan-390.png", 390, 844);

  await page.getByTestId("batch-preview").click();
  await expect(page.getByTestId("batch-plan")).toBeVisible({ timeout: 10_000 });
  await shot("batch-drawer-dryrun-1440.png", 1440, 900);
});
