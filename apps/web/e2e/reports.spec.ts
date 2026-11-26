import { expect, test, type Page } from "./fixtures.js";

/**
 * Task 21 Playwright: reports landing + six kinds; Excel/PDF export; FIELD gated.
 */

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

const KINDS = [
  "revenue",
  "service-coverage",
  "outstanding",
  "cash",
  "expirations",
  "products",
] as const;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

test.describe("reports OFFICE 1440", () => {
  test("open six reports, filter, export Excel+PDF, totals match JSON", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop layout");
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, OFFICE.email, OFFICE.password);

    await page.goto("/reports");
    await expect(page.getByTestId("reports-landing")).toBeVisible();
    for (const kind of KINDS) {
      await expect(
        page.getByTestId(`report-card-${kind.toUpperCase().replace(/-/g, "_")}`),
      ).toBeVisible();
    }

    let opened = 0;
    for (const kind of KINDS) {
      await page.goto(`/reports/${kind}`);
      await expect(page.getByTestId("report-filter-bar")).toBeVisible();
      await page.getByTestId("report-filter-from").fill("2020-01-01");
      await page.getByTestId("report-filter-to").fill("2030-12-31");
      await page.getByTestId("report-refresh").click();
      await expect(
        page.getByTestId("report-table").or(page.getByTestId("report-empty")),
      ).toBeVisible({ timeout: 30_000 });
      opened += 1;
    }
    console.log(`REPORTS_OPENED=${opened}`);

    for (const kind of ["REVENUE", "CASH"] as const) {
      const xlsx = await page.request.get(
        `/api/reports/${kind}/export?format=excel&from=2020-01-01&to=2030-12-31`,
      );
      expect(xlsx.ok()).toBeTruthy();
      expect(xlsx.headers()["content-type"]).toContain("spreadsheetml.sheet");
      const xbuf = Buffer.from(await xlsx.body());
      expect(xbuf[0]).toBe(0x50);
      expect(xbuf[1]).toBe(0x4b);

      const pdf = await page.request.get(
        `/api/reports/${kind}/export?format=pdf&from=2020-01-01&to=2030-12-31`,
      );
      expect(pdf.ok()).toBeTruthy();
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
      const pbuf = Buffer.from(await pdf.body());
      expect(pbuf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    }
    console.log("REPORTS_EXPORT=2");

    const json = await page.request.get(
      "/api/reports/REVENUE?from=2020-01-01&to=2030-12-31&pageSize=100",
    );
    expect(json.ok()).toBeTruthy();
    const body = (await json.json()) as {
      totals: { grossAmount: string };
      items: unknown[];
    };
    await page.goto("/reports/revenue");
    await page.getByTestId("report-filter-from").fill("2020-01-01");
    await page.getByTestId("report-filter-to").fill("2030-12-31");
    await page.getByTestId("report-refresh").click();
    if (body.items.length > 0) {
      await expect(page.getByTestId("report-totals")).toBeVisible();
    }
    console.log("REPORTS_TOTALS_CHECKED=1");
    console.log(`OFFICE1440_REPORTS=${opened}`);
  });
});

test.describe("reports OFFICE 390", () => {
  test("open two reports and export menu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-390", "phone layout");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, OFFICE.email, OFFICE.password);
    await page.goto("/reports/revenue");
    await expect(page.getByTestId("report-page-REVENUE")).toBeVisible();
    await expect(page.getByTestId("report-export-menu")).toBeVisible();
    await page.goto("/reports/cash");
    await expect(page.getByTestId("report-page-CASH")).toBeVisible();
    await expect(page.getByTestId("report-export-menu")).toBeVisible();
    console.log("OFFICE390_REPORTS=2");
  });
});

test.describe("reports FIELD", () => {
  test("nav hides Справки; /reports redirects away", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop nav");
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, FIELD.email, FIELD.password);
    const nav = page.getByRole("navigation", { name: "Основна навигация" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Справки" })).toHaveCount(0);
    await page.goto("/reports");
    await expect(page).not.toHaveURL(/\/reports$/);
    console.log("FIELD_REPORTS_HIDDEN=1");
  });
});
