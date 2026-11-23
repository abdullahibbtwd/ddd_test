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

async function stubOsmTiles(page: Page) {
  await page.route("**/*tile.openstreetmap.org/**", async (route) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
}

async function setDateInput(page: Page, value: string) {
  const dateInput = page.getByTestId("visit-date");
  await dateInput.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.removeAttribute("min");
    input.removeAttribute("max");
    const proto = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    );
    proto?.set?.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test.describe("visits", () => {
  test.beforeEach(async ({ page }) => {
    await stubOsmTiles(page);
  });

  test.describe("OFFICE visit lifecycle", () => {
    test.use({
      consoleGuard: {
        allowApiFailures: [
          { status: 409, url: /\/api\/visits/ },
          { status: 422, url: /\/api\/visits/ },
        ],
        allowConsole: [/_leaflet_pos/],
      },
    });

    test("create, edit notes, cancel, see struck-through", async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name === "phone-390",
        "intentional: full OFFICE visit flow covered on desktop; phone covered by FIELD test",
      );
      test.setTimeout(180_000);

      const suffix = `T13-${Date.now()}`;
      const notes = `Е2Е бележка ${suffix}`;
      const reason = `Е2Е анулиране ${suffix}`;

      await login(page, OFFICE.email, OFFICE.password);
      await page.goto("/sites");
      await page.getByLabel("Търсене").fill("E2E Обект 1");
      await expect(page.getByRole("cell", { name: /E2E Обект 1/ })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("cell", { name: /E2E Обект 1/ }).click();

      const drawer = page.getByRole("dialog");
      await drawer.getByRole("tab", { name: "Посещения" }).click();
      await expect(drawer.getByTestId("visits-panel")).toBeVisible();
      await drawer.getByRole("button", { name: "Ново посещение" }).click();

      await expect(page.getByTestId("visit-form")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("visit-treatment-type").click();
      await page.getByRole("option", { name: "Друго" }).click();
      await page.getByTestId("visit-notes").fill(notes);

      const createResp = page.waitForResponse(
        (r) =>
          r.url().includes("/api/visits") &&
          r.request().method() === "POST" &&
          (r.status() === 200 || r.status() === 201),
      );
      await page.getByRole("button", { name: "Запази" }).click();
      const created = await createResp;
      const visitId = ((await created.json()) as { id: string }).id;

      await page.goto(`/visits/${visitId}/edit`);
      await expect(page.getByTestId("visit-form")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("visit-notes")).toHaveValue(notes, { timeout: 10_000 });
      await page.getByTestId("visit-notes").fill(`${notes} редактирано`);
      await page.getByRole("button", { name: "Запази" }).click();

      await page.goto(`/visits/${visitId}/edit`);
      await expect(page.getByTestId("visit-notes")).toHaveValue(`${notes} редактирано`, {
        timeout: 10_000,
      });
      await page.getByTestId("visit-cancel-open").click();
      await page.getByTestId("visit-cancel-reason").fill(reason);
      await page.getByRole("button", { name: "Анулирай" }).click();

      await expect(page.getByRole("dialog").getByTestId("visits-panel")).toBeVisible({
        timeout: 15_000,
      });
      const panel = page.getByRole("dialog").getByTestId("visits-panel");
      // Unique cancel reason (multiple cancelled rows may exist from seeds).
      await expect(panel.getByText(reason)).toBeVisible({ timeout: 10_000 });
      await expect(
        panel.locator("li").filter({ hasText: reason }).locator(".line-through").first(),
      ).toBeVisible();
    });
  });

  test.describe("FIELD visit recording", () => {
    test.use({
      consoleGuard: {
        allowApiFailures: [
          { status: 404, url: /\/api\// },
          { status: 422, url: /\/api\/visits/ },
          { status: 403, url: /\/api\/visits/ },
        ],
        allowConsole: [/_leaflet_pos/],
      },
    });

    test("create today with read-only amount; reject 8-day date; out-of-scope not-found", async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "phone-390",
        "intentional: FIELD mobile recording is the phone-390 path",
      );
      test.setTimeout(180_000);

      await login(page, FIELD.email, FIELD.password);
      await page.goto("/sites");
      await page.getByLabel("Търсене").fill("E2E Обект 1");
      const cell = page.getByRole("cell", { name: /E2E Обект 1/ });
      await expect(cell).toBeVisible({ timeout: 15_000 });
      await cell.click();

      const drawer = page.getByRole("dialog");
      await drawer.getByRole("tab", { name: "Посещения" }).click();
      await drawer.getByRole("button", { name: "Ново посещение" }).click();

      await expect(page.getByTestId("visit-form")).toBeVisible({ timeout: 10_000 });
      const siteId = new URL(page.url()).searchParams.get("siteId");
      expect(siteId).toBeTruthy();

      // Wait for site + current subscription snapshot to load into the amount field.
      await expect(page.getByTestId("visit-site-name")).not.toHaveValue("…", {
        timeout: 10_000,
      });
      const amount = page.getByTestId("visit-amount");
      await expect(amount).not.toHaveValue("", { timeout: 10_000 });
      await expect(amount).toBeDisabled();

      const createResp = page.waitForResponse(
        (r) =>
          r.url().includes("/api/visits") &&
          r.request().method() === "POST" &&
          (r.status() === 200 || r.status() === 201),
      );
      await page.getByRole("button", { name: "Запази" }).click();
      await createResp;

      await page.goto(`/sites?siteId=${siteId}&tab=visits`);
      await expect(page.getByTestId("visits-panel")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Ново посещение" }).click();
      await expect(page.getByTestId("visit-form")).toBeVisible();
      const eightAgo = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 8);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
      await setDateInput(page, eightAgo);
      await expect(page.getByTestId("visit-date")).toHaveValue(eightAgo);
      await page.getByRole("button", { name: "Запази" }).click();
      await expect(
        page.getByText(/извън позволения период|7 дни/i),
      ).toBeVisible({ timeout: 10_000 });

      await page.goto(`/visits/new?siteId=00000000-0000-4000-8000-000000000099`);
      await expect(page.getByTestId("visit-site-not-found")).toBeVisible({ timeout: 10_000 });
    });
  });
});
