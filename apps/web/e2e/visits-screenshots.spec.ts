import { expect, test, type Page } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/task-13/screenshots",
);

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(creds.email);
  await page.getByLabel("Парола").fill(creds.password);
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

test.use({
  consoleGuard: {
    allowApiFailures: [
      { status: 409, url: /\/api\/visits/ },
      { status: 422, url: /\/api\/visits/ },
      { status: 404, url: /\/api\// },
    ],
    allowConsole: [/_leaflet_pos/],
  },
});

test("capture visits screenshots at 1440 and 390", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run",
  );
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await stubOsmTiles(page);

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  };

  const suffix = `Shot-${Date.now()}`;
  const notes = `Е2Е бележка ${suffix}`;
  const reason = `Е2Е анулиране ${suffix}`;

  await login(page, OFFICE);
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
  await shot("visit-create-1440.png", 1440, 900);
  await shot("visit-create-390.png", 390, 844);

  await page.getByTestId("visit-notes").fill(notes);
  const createRes = page.waitForResponse(
    (r) =>
      r.url().includes("/api/visits") &&
      r.request().method() === "POST" &&
      (r.status() === 200 || r.status() === 201),
  );
  await page.getByRole("button", { name: "Запази" }).click();
  const created = await createRes;
  const visitId = ((await created.json()) as { id: string }).id;

  await page.goto(`/visits/${visitId}/edit`);
  await expect(page.getByTestId("visit-form")).toBeVisible({ timeout: 10_000 });
  await shot("visit-edit-office-1440.png", 1440, 900);
  await shot("visit-edit-office-390.png", 390, 844);

  await page.getByTestId("visit-cancel-open").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByTestId("visit-cancel-reason").fill(reason);
  await shot("visit-cancel-dialog-1440.png", 1440, 900);
  await shot("visit-cancel-dialog-390.png", 390, 844);
  await page.getByRole("button", { name: "Анулирай" }).click();

  await expect(page.getByRole("dialog").getByTestId("visits-panel")).toBeVisible({
    timeout: 15_000,
  });
  const panel = page.getByRole("dialog").getByTestId("visits-panel");
  await expect(panel.getByText(reason)).toBeVisible({ timeout: 10_000 });
  await shot("visits-tab-cancelled-1440.png", 1440, 900);
  await shot("visits-tab-cancelled-390.png", 390, 844);

  await page.goto("/login");
  await login(page, FIELD);
  await page.goto("/sites");
  await page.getByLabel("Търсене").fill("E2E Обект 1");
  await expect(page.getByRole("cell", { name: /E2E Обект 1/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("cell", { name: /E2E Обект 1/ }).click();
  const fieldDrawer = page.getByRole("dialog");
  await fieldDrawer.getByRole("tab", { name: "Посещения" }).click();
  await fieldDrawer.getByRole("button", { name: "Ново посещение" }).click();
  await expect(page.getByTestId("visit-form")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("visit-site-name")).not.toHaveValue("…", {
    timeout: 10_000,
  });
  const amount = page.getByTestId("visit-amount");
  await expect(amount).not.toHaveValue("", { timeout: 10_000 });
  await expect(amount).toBeDisabled();
  await shot("visit-create-field-readonly-amount-1440.png", 1440, 900);
  await shot("visit-create-field-readonly-amount-390.png", 390, 844);
});
