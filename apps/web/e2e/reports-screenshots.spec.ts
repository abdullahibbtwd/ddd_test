import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./fixtures.js";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };

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

const OUT = path.resolve(
  process.cwd(),
  "../../docs/evidence/task-21/screenshots",
);
const EXPORTS = path.resolve(
  process.cwd(),
  "../../docs/evidence/task-21/exports",
);

const API_KINDS = [
  "REVENUE",
  "SERVICE_COVERAGE",
  "OUTSTANDING",
  "CASH",
  "EXPIRATIONS",
  "PRODUCTS",
] as const;

test.describe("reports screenshots", () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
    mkdirSync(EXPORTS, { recursive: true });
  });

  for (const width of [1440, 390] as const) {
    test(`landing + each report @${width}`, async ({ page }, testInfo) => {
      test.skip(
        width === 1440
          ? testInfo.project.name !== "desktop"
          : testInfo.project.name !== "phone-390",
        "project matches viewport",
      );
      test.setTimeout(180_000);
      await page.setViewportSize({
        width,
        height: width === 1440 ? 900 : 844,
      });
      await login(page, OFFICE.email, OFFICE.password);

      await page.goto("/reports");
      await expect(page.getByTestId("reports-landing")).toBeVisible();
      await page.screenshot({
        path: path.join(OUT, `landing-${width}.png`),
        fullPage: true,
      });

      for (const kind of KINDS) {
        await page.goto(`/reports/${kind}`);
        await page.getByTestId("report-filter-from").fill("2026-01-01");
        await page.getByTestId("report-filter-to").fill("2026-12-31");
        await page.getByTestId("report-refresh").click();
        await expect(
          page.getByTestId("report-table").or(page.getByTestId("report-empty")),
        ).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
          path: path.join(OUT, `${kind}-${width}.png`),
          fullPage: true,
        });
      }

      // Capture sample exports once (desktop run). Narrow year keeps
      // SERVICE_COVERAGE (site × month) within Gotenberg memory.
      if (width === 1440) {
        const { writeFileSync } = await import("node:fs");
        for (const kind of API_KINDS) {
          for (const format of ["excel", "pdf"] as const) {
            const res = await page.request.get(
              `/api/reports/${kind}/export?format=${format}&from=2026-01-01&to=2026-12-31`,
            );
            expect(
              res.ok(),
              `${kind}/${format} → ${res.status()}`,
            ).toBeTruthy();
            const ext = format === "excel" ? "xlsx" : "pdf";
            const slug = kind.toLowerCase().replace(/_/g, "-");
            writeFileSync(
              path.join(EXPORTS, `report-${slug}-2026-01-01-2026-12-31.${ext}`),
              Buffer.from(await res.body()),
            );
          }
        }
      }
    });
  }
});
