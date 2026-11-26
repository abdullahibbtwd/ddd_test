import { expect, test, type Page } from "./fixtures.js";

const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

/** Build a checksum-valid 9-digit EIK from an 8-digit prefix. */
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
  const base = (10000000 + (Date.now() % 80000000) + n * 17) % 100000000;
  return eikFromPrefix(String(base).padStart(8, "0"));
}

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(creds.email);
  await page.getByLabel("Парола").fill(creds.password);
  await page.getByRole("button", { name: "Вход" }).click();
}

async function openClients(page: Page, isPhone: boolean) {
  if (isPhone) {
    await page.getByRole("button", { name: "Отвори менюто" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Клиенти" }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Основна навигация" })
      .getByRole("link", { name: "Клиенти" })
      .click();
  }
  await expect(page).toHaveURL(/\/clients/);
  await expect(page.getByRole("heading", { level: 1, name: "Клиенти" })).toBeVisible();
}

/** Desktop table cell or mobile card button. */
function clientListItem(page: Page, name: string, isPhone: boolean) {
  if (isPhone) {
    return page.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  }
  return page.getByRole("cell", { name, exact: true });
}

async function fillCompanyForm(
  drawer: ReturnType<Page["getByRole"]>,
  opts: { name: string; eik: string },
) {
  await drawer.getByRole("combobox").first().click();
  await drawer.page().getByRole("option", { name: "Фирма" }).click();
  await drawer.getByLabel(/Наименование/).fill(opts.name);
  await drawer.getByLabel(/^ЕИК/).fill(opts.eik);
}

test.describe("Task 10: clients", () => {
  test("office creates company, duplicate EIK blocks save, similar name warns, archive works", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isPhone = testInfo.project.name === "phone-390";
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const companyName = `Е2Е Ресторант ${suffix} ЕООД`;
    const similarName = `Е2Е Ресторант ${suffix}`;
    const eikA = uniqueEik(1);
    const eikB = uniqueEik(2);

    await login(page, OFFICE);
    await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();
    await openClients(page, isPhone);

    await page.getByRole("button", { name: "Нов клиент" }).click();
    const createDrawer = page.getByRole("dialog", { name: "Нов клиент" });
    await expect(createDrawer).toBeVisible();
    await fillCompanyForm(createDrawer, { name: companyName, eik: eikA });
    await createDrawer.getByRole("button", { name: "Запази" }).click();
    await expect(createDrawer).toHaveCount(0);
    await page.getByLabel("Търсене").fill(companyName);
    await expect(clientListItem(page, companyName, isPhone)).toBeVisible({ timeout: 15_000 });

    // Same EIK → inline error + disabled save
    await page.getByRole("button", { name: "Нов клиент" }).click();
    const dupDrawer = page.getByRole("dialog", { name: "Нов клиент" });
    await fillCompanyForm(dupDrawer, { name: `Друг ${suffix} ООД`, eik: eikA });
    await expect(dupDrawer.getByText(/Клиент с този ЕИК вече съществува/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(dupDrawer.getByRole("button", { name: "Запази" })).toBeDisabled();
    await page.keyboard.press("Escape");

    // Similar name warning — different EIK, save still allowed
    await page.getByRole("button", { name: "Нов клиент" }).click();
    const similarDrawer = page.getByRole("dialog", { name: "Нов клиент" });
    await fillCompanyForm(similarDrawer, { name: similarName, eik: eikB });
    await expect(similarDrawer.getByText("Възможни дубликати по име:")).toBeVisible({
      timeout: 10_000,
    });
    await expect(similarDrawer.getByRole("button", { name: "Запази" })).toBeEnabled();
    await similarDrawer.getByRole("button", { name: "Запази" }).click();
    await expect(similarDrawer).toHaveCount(0);
    await page.getByLabel("Търсене").fill(similarName);
    await expect(clientListItem(page, similarName, isPhone)).toBeVisible({
      timeout: 15_000,
    });

    // Edit + archive
    await page.getByLabel("Търсене").fill(companyName);
    await clientListItem(page, companyName, isPhone).click();
    const editDrawer = page.getByRole("dialog", { name: "Редакция на клиент" });
    await expect(editDrawer).toBeVisible();
    await editDrawer.getByLabel(/Наименование/).fill(`${companyName} редакция`);
    await editDrawer.getByRole("button", { name: "Запази" }).click();
    await expect(editDrawer).toHaveCount(0);

    const editedName = `${companyName} редакция`;
    await page.getByLabel("Търсене").fill(editedName);
    await clientListItem(page, editedName, isPhone).click();
    const archiveDrawer = page.getByRole("dialog", { name: "Редакция на клиент" });
    await archiveDrawer.getByRole("button", { name: "Архивирай" }).click();
    await page.getByRole("button", { name: "Потвърди" }).click();
    await expect(archiveDrawer).toHaveCount(0);

    await page.getByLabel("Търсене").fill("");
    await page.getByLabel("Статус").click();
    await page.getByRole("option", { name: "Архивирани" }).click();
    await page.getByLabel("Търсене").fill(editedName);
    await expect(clientListItem(page, editedName, isPhone)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("FIELD is redirected away from /clients; ADMIN can open clients", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const isPhone = testInfo.project.name === "phone-390";

    await login(page, FIELD);
    await expect(page).toHaveURL(/\/sites/);
    await page.goto("/clients");
    await expect(page).not.toHaveURL(/\/clients/);
    await expect(page).toHaveURL(/\/sites/);

    await login(page, ADMIN);
    await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();
    await openClients(page, isPhone);
    await expect(page.getByRole("button", { name: "Нов клиент" })).toBeVisible();
  });
});
