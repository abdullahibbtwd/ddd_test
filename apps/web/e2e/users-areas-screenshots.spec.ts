import { expect, test } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/evidence/task-9");

test("capture users and areas screenshots at 1440 and 390", async ({ page }, testInfo) => {
  // Intentional: this single desktop-project run resizes to 1440 and 390 itself.
  // Skipping phone-390 avoids duplicate evidence captures and double runtime.
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run (setViewportSize 1440+390)",
  );
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Имейл").fill(ADMIN.email);
  await page.getByLabel("Парола").fill(ADMIN.password);
  await page.getByRole("button", { name: "Вход" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: resolve(OUT, name), fullPage: true });
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings/users");
  await expect(page.getByRole("tab", { name: "Потребители" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await shot("users-list-1440.png", 1440, 900);

  await page.locator("table tbody tr").first().click();
  await expect(page.getByRole("dialog", { name: "Редакция на потребител" })).toBeVisible();
  await shot("users-drawer-edit-1440.png", 1440, 900);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Нов потребител" }).click();
  const createDrawer = page.getByRole("dialog", { name: "Нов потребител" });
  await createDrawer.getByRole("textbox", { name: "Име задължително" }).fill("Screenshot Office");
  await createDrawer.getByRole("textbox", { name: "Имейл задължително" }).fill(`screenshot-${Date.now()}@e2e.local`);
  await createDrawer.getByRole("button", { name: "Запази" }).click();
  await expect(page.getByRole("dialog", { name: "Временна парола" })).toBeVisible({ timeout: 15_000 });
  await shot("users-temp-password-1440.png", 1440, 900);
  await page.getByRole("dialog", { name: "Временна парола" }).getByRole("button", { name: "Готово" }).click();

  await page.goto("/settings/areas");
  await expect(page.getByRole("tab", { name: "Райони" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await shot("areas-list-1440.png", 1440, 900);

  await page.locator("table tbody tr").first().click();
  await expect(page.getByRole("dialog", { name: "Редакция на район" })).toBeVisible();
  await shot("areas-drawer-edit-1440.png", 1440, 900);
  await page.keyboard.press("Escape");

  await page.goto("/settings/users");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await shot("users-list-390.png", 390, 844);

  await page.locator("table tbody tr").first().click();
  await expect(page.getByRole("dialog", { name: "Редакция на потребител" })).toBeVisible();
  await shot("users-drawer-edit-390.png", 390, 844);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Нов потребител" }).click();
  const createDrawerPhone = page.getByRole("dialog", { name: "Нов потребител" });
  await createDrawerPhone.getByRole("textbox", { name: "Име задължително" }).fill("Screenshot Phone");
  await createDrawerPhone.getByRole("textbox", { name: "Имейл задължително" }).fill(`screenshot-phone-${Date.now()}@e2e.local`);
  await createDrawerPhone.getByRole("button", { name: "Запази" }).click();
  await expect(page.getByRole("dialog", { name: "Временна парола" })).toBeVisible({ timeout: 15_000 });
  await shot("users-temp-password-390.png", 390, 844);
  await page.getByRole("dialog", { name: "Временна парола" }).getByRole("button", { name: "Готово" }).click();

  await page.goto("/settings/areas");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await shot("areas-list-390.png", 390, 844);

  await page.locator("table tbody tr").first().click();
  await expect(page.getByRole("dialog", { name: "Редакция на район" })).toBeVisible();
  await shot("areas-drawer-edit-390.png", 390, 844);
});