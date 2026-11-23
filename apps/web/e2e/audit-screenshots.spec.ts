import { expect, test } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/evidence/task-8");

test("capture Журнал screenshots at 1440 and 390", async ({ page }, testInfo) => {
  // Intentional: this single desktop-project run resizes to 1440 and 390 itself.
  // Skipping phone-390 avoids duplicate evidence captures and double runtime.
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run (setViewportSize 1440+390)",
  );
  mkdirSync(OUT, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Имейл").fill(ADMIN.email);
  await page.getByLabel("Парола").fill(ADMIN.password);
  await page.getByRole("button", { name: "Вход" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings/audit");
  await expect(page.getByRole("tab", { name: "Журнал" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: resolve(OUT, "audit-journal-1440.png"),
    fullPage: true,
  });

  // Prefer an UPDATE row for the drawer; fall back to first row.
  const updateCell = page.getByRole("cell", { name: "Промяна" }).first();
  if (await updateCell.count()) {
    await updateCell.click();
  } else {
    await page.locator("table tbody tr").first().click();
  }
  await expect(page.getByRole("heading", { name: "Запис в журнала" })).toBeVisible();
  await page.screenshot({
    path: resolve(OUT, "audit-drawer-update-1440.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/audit");
  await expect(page.getByRole("tab", { name: "Журнал" })).toBeVisible();
  await page.screenshot({
    path: resolve(OUT, "audit-journal-390.png"),
    fullPage: true,
  });

  const updateCellPhone = page.getByRole("cell", { name: "Промяна" }).first();
  if (await updateCellPhone.count()) {
    await updateCellPhone.click();
  } else {
    await page.locator("table tbody tr").first().click();
  }
  await expect(page.getByRole("heading", { name: "Запис в журнала" })).toBeVisible();
  await page.screenshot({
    path: resolve(OUT, "audit-drawer-update-390.png"),
    fullPage: true,
  });
});
