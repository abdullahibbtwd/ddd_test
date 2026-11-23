import { expect, test } from "./fixtures.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/evidence/task-10");

function eikFromPrefix(prefix8: string): string {
  const d = prefix8.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += d[i]! * (i + 1);
  let r = sum % 11;
  if (r === 10) {
    sum = 0;
    for (let i = 0; i < 8; i++) sum += d[i]! * (i + 3);
    r = sum % 11;
    if (r === 10) r = 0;
  }
  return `${prefix8}${r}`;
}

function uniqueEik(n: number): string {
  const base = (20000000 + (Date.now() % 70000000) + n * 31) % 100000000;
  return eikFromPrefix(String(base).padStart(8, "0"));
}

test("capture clients screenshots at 1440 and 390", async ({ page }, testInfo) => {
  // Intentional: this single desktop-project run resizes to 1440 and 390 itself.
  // Skipping phone-390 avoids duplicate evidence captures and double runtime.
  test.skip(
    testInfo.project.name === "phone-390",
    "intentional: dual-viewport evidence captured in one desktop run (setViewportSize 1440+390)",
  );
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Имейл").fill(OFFICE.email);
  await page.getByLabel("Парола").fill(OFFICE.password);
  await page.getByRole("button", { name: "Вход" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();

  const stamp = Date.now();
  const baseName = `Евид Ресторант ${stamp} ЕООД`;
  const eikExisting = uniqueEik(1);
  const eikSimilar = uniqueEik(2);

  await page.goto("/clients");
  await expect(page.getByRole("heading", { level: 1, name: "Клиенти" })).toBeVisible();

  // Seed one client for duplicate / similar flows.
  await page.getByRole("button", { name: "Нов клиент" }).click();
  let drawer = page.getByRole("dialog", { name: "Нов клиент" });
  await drawer.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Фирма" }).click();
  await drawer.getByLabel(/Наименование/).fill(baseName);
  await drawer.getByLabel(/^ЕИК/).fill(eikExisting);
  await drawer.getByRole("button", { name: "Запази" }).click();
  await expect(drawer).toHaveCount(0);

  const shot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: resolve(OUT, name), fullPage: true });
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Търсене").fill(baseName);
  await expect(page.getByRole("cell", { name: baseName })).toBeVisible({ timeout: 15_000 });
  await shot("clients-list-1440.png", 1440, 900);

  // Create drawer with similar-name warning
  await page.getByRole("button", { name: "Нов клиент" }).click();
  drawer = page.getByRole("dialog", { name: "Нов клиент" });
  await drawer.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Фирма" }).click();
  await drawer.getByLabel(/Наименование/).fill(`Евид Ресторант ${stamp}`);
  await drawer.getByLabel(/^ЕИК/).fill(eikSimilar);
  await expect(drawer.getByText("Възможни дубликати по име:")).toBeVisible({ timeout: 10_000 });
  await shot("clients-drawer-similar-1440.png", 1440, 900);

  // Same-EIK error
  await drawer.getByLabel(/^ЕИК/).fill(eikExisting);
  await expect(drawer.getByText(/Клиент с този ЕИК вече съществува/)).toBeVisible({
    timeout: 10_000,
  });
  await shot("clients-drawer-same-eik-1440.png", 1440, 900);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  // Phone viewport — list only (drawer closed)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Търсене").fill(baseName);
  await expect(page.getByRole("heading", { level: 1, name: "Клиенти" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await shot("clients-list-390.png", 390, 844);

  await page.getByRole("button", { name: "Нов клиент" }).click();
  drawer = page.getByRole("dialog", { name: "Нов клиент" });
  await drawer.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Фирма" }).click();
  await drawer.getByLabel(/Наименование/).fill(`Евид Ресторант ${stamp}`);
  await drawer.getByLabel(/^ЕИК/).fill(eikSimilar);
  await expect(drawer.getByText("Възможни дубликати по име:")).toBeVisible({ timeout: 10_000 });
  await shot("clients-drawer-similar-390.png", 390, 844);

  await drawer.getByLabel(/^ЕИК/).fill(eikExisting);
  await expect(drawer.getByText(/Клиент с този ЕИК вече съществува/)).toBeVisible({
    timeout: 10_000,
  });
  await shot("clients-drawer-same-eik-390.png", 390, 844);
});
