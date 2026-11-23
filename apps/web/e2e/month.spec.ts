import { expect, test, type Page } from "./fixtures.js";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const MONTH = "2026-11";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

test.describe("month / Този месец", () => {
  test.describe("OFFICE", () => {
    test.use({
      consoleGuard: {
        allowConsole: [],
      },
    });

    test("tiles, row opens site, calendar day drawer", async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await login(page, OFFICE.email, OFFICE.password);
      await page.goto(`/month?month=${MONTH}`);
      await expect(page.getByTestId("month-page")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("month-summary")).toBeVisible();
      await expect(page.getByTestId("month-tile-SERVICED")).toBeVisible();
      await expect(page.getByTestId("month-tile-UPCOMING")).toBeVisible();
      await expect(page.getByTestId("month-tile-OVERDUE")).toBeVisible();
      await expect(page.getByTestId("month-area-filter")).toBeVisible();
      await expect(page.getByTestId("month-employee-filter")).toBeVisible();

      // Narrow to the FIELD e2e actor so dedicated month sites are on page 1
      // (dev/perf OVERDUE rows otherwise fill the first pages).
      await page.getByTestId("month-employee-filter").getByRole("combobox").click();
      await page.getByRole("option", { name: "E2E Field", exact: true }).click();
      await expect(page.getByText("E2E Месец Просрочен")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("E2E Месец Обслужен")).toBeVisible();
      await expect(page.getByText("E2E Месец Предстоящ")).toBeVisible();
      await expect(page.getByTestId("month-tile-SERVICED")).toContainText(/[1-9]/);
      await expect(page.getByTestId("month-tile-UPCOMING")).toContainText(/[1-9]/);
      await expect(page.getByTestId("month-tile-OVERDUE")).toContainText(/[1-9]/);
      await page.getByText("E2E Месец Просрочен").click();
      await expect(page).toHaveURL(/\/sites\?.*siteId=/);
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
      await page.goBack();
      await expect(page.getByTestId("month-page")).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("month-tab-calendar").click();
      if (testInfo.project.name === "phone-390") {
        await expect(page.getByTestId("month-calendar-weeklist")).toBeVisible();
        await page.getByTestId("month-day-mobile-2026-11-10").click();
      } else {
        await expect(page.getByTestId("month-calendar-grid")).toBeVisible();
        await page.getByTestId("month-day-2026-11-10").click();
      }
      await expect(page.getByTestId("month-day-drawer")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("month-day-drawer")).toContainText("E2E Месец Обслужен");
      await page.getByRole("button", { name: "Затвори" }).click();
    });
  });

  test.describe("FIELD phone", () => {
    test.use({
      consoleGuard: { allowConsole: [] },
    });

    test("hides area/employee filters; week list; open site from day", async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "phone-390",
        "FIELD calendar week-list is asserted at 390px",
      );
      test.setTimeout(180_000);
      await login(page, FIELD.email, FIELD.password);
      await page.goto(`/month?month=${MONTH}`);
      await expect(page.getByTestId("month-page")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("month-area-filter")).toHaveCount(0);
      await expect(page.getByTestId("month-employee-filter")).toHaveCount(0);

      await page.getByTestId("month-tab-calendar").click();
      await expect(page.getByTestId("month-calendar-weeklist")).toBeVisible();
      await page.getByTestId("month-day-mobile-2026-11-10").click();
      await expect(page.getByTestId("month-day-drawer")).toBeVisible({ timeout: 10_000 });
      const siteLink = page.getByTestId("month-day-drawer").getByRole("button").first();
      await siteLink.click();
      await expect(page).toHaveURL(/\/sites\?.*siteId=/);
    });
  });
});
