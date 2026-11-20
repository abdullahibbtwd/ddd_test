import { expect, test, type Browser, type Page } from "@playwright/test";

const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`[pageerror] ${error.message}`));
  return errors;
}

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(creds.email);
  await page.getByLabel("Парола").fill(creds.password);
  await page.getByRole("button", { name: "Вход" }).click();
}

/** Desktop: sidebar is visible. Phone: open the menu drawer first. */
async function visibleNav(page: Page, isPhone: boolean) {
  if (isPhone) {
    await page.getByRole("button", { name: "Отвори менюто" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog.getByRole("navigation", { name: "Основна навигация" });
  }
  return page.getByRole("navigation", { name: "Основна навигация" });
}

async function openSettingsUsers(page: Page, isPhone: boolean) {
  if (isPhone) {
    await page.getByRole("button", { name: "Отвори менюто" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Настройки" }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Основна навигация" })
      .getByRole("link", { name: "Настройки" })
      .click();
  }
  await expect(page).toHaveURL(/\/settings\/users/);
  await expect(page.getByRole("tab", { name: "Потребители" })).toBeVisible();
}

test("logs in as admin, shows nav, logs out", async ({ page }, testInfo) => {
  const errors = trackConsole(page);
  const isPhone = testInfo.project.name === "phone-390";
  await login(page, ADMIN);

  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();
  const nav = await visibleNav(page, isPhone);
  await expect(nav.getByRole("link", { name: "Клиенти" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Настройки" })).toBeVisible();

  if (isPhone) {
    await expect(page.getByRole("dialog").getByRole("button", { name: "Изход" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Изход" }).click();
  } else {
    await page.getByRole("button", { name: "Изход" }).click();
  }
  await expect(page).toHaveURL(/\/login/);
  expect(errors.filter((e) => !e.includes("401"))).toEqual([]);
});

test("wrong password shows the Bulgarian error", async ({ page }) => {
  await login(page, { email: ADMIN.email, password: "definitely-wrong-password" });
  await expect(page.getByRole("alert")).toHaveText("Грешен имейл или парола.");
  await expect(page).toHaveURL(/\/login/);
});

test("direct visit to /clients when logged out redirects to /login", async ({ page }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);
  expect(page.url()).toMatch(/redirect=/);
});

test("FIELD user does not see Настройки and is redirected away from /settings", async ({
  page,
}, testInfo) => {
  const isPhone = testInfo.project.name === "phone-390";
  await login(page, FIELD);

  await expect(page).toHaveURL(/\/visits/);
  const nav = await visibleNav(page, isPhone);
  await expect(nav.getByRole("link", { name: "Посещения" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Настройки" })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/visits/);
});

test("OFFICE cannot reach /settings", async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === "phone-390";
  await login(page, OFFICE);
  await expect(page).toHaveURL(/\/$/);

  const nav = await visibleNav(page, isPhone);
  await expect(nav.getByRole("link", { name: "Настройки" })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings/users");
  await expect(page).toHaveURL(/\/$/);
});

test("FIELD cannot reach /settings/audit", async ({ page }) => {
  await login(page, FIELD);
  await expect(page).toHaveURL(/\/visits/);
  await page.goto("/settings/audit");
  await expect(page).toHaveURL(/\/visits/);
});

test("admin opens Настройки > Потребители (default tab)", async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === "phone-390";
  test.setTimeout(60_000);
  await login(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();
  await openSettingsUsers(page, isPhone);
  await expect(page.getByRole("button", { name: "Нов потребител" })).toBeVisible();
});

test("admin opens Настройки > Журнал and sees a password-change row", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone-390", "desktop flow only");
  test.setTimeout(60_000);
  await login(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Основна навигация" })
    .getByRole("link", { name: "Настройки" })
    .click();
  await expect(page).toHaveURL(/\/settings\/users/);
  await page.getByRole("tab", { name: "Журнал" }).click();
  await expect(page).toHaveURL(/\/settings\/audit/);

  await page.goto("/change-password");
  await page.locator('input[name="currentPassword"]').fill(ADMIN.password);
  await page.locator('input[name="newPassword"]').fill("E2eAdminPass2!");
  await page.locator('input[name="repeatPassword"]').fill("E2eAdminPass2!");
  await page.getByRole("button", { name: "Запази паролата" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Restore password for later tests / re-runs.
  await page.goto("/change-password");
  await page.locator('input[name="currentPassword"]').fill("E2eAdminPass2!");
  await page.locator('input[name="newPassword"]').fill(ADMIN.password);
  await page.locator('input[name="repeatPassword"]').fill(ADMIN.password);
  await page.getByRole("button", { name: "Запази паролата" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/settings/audit");
  await expect(page.getByText("Смяна на парола").first()).toBeVisible({ timeout: 15_000 });
});

test("style guide: renders when authenticated", async ({ page }) => {
  const errors = trackConsole(page);
  await login(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible();
  await page.goto("/dev/styleguide");
  await expect(page).toHaveURL(/\/dev\/styleguide/);
  await expect(page.getByRole("heading", { level: 1, name: "Стилово ръководство" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Свързан", { exact: true })).toBeVisible();
  expect(errors.filter((e) => !e.includes("401"))).toEqual([]);
});

async function createFieldUserWithTwoAreas(
  page: Page,
  isPhone: boolean,
  email: string,
): Promise<string> {
  await openSettingsUsers(page, isPhone);
  await page.getByRole("button", { name: "Нов потребител" }).click();
  const drawer = page.getByRole("dialog", { name: "Нов потребител" });
  await expect(drawer).toBeVisible();

  await drawer.getByRole("textbox", { name: "Имезадължително" }).fill("E2E Task 9 Field");
  await drawer.getByRole("textbox", { name: "Имейлзадължително" }).fill(email);

  await drawer.getByRole("combobox").click();
  await page.getByRole("option", { name: "Терен" }).click();

  await drawer.getByRole("checkbox", { name: "Център" }).check();
  await drawer.getByRole("checkbox", { name: "Изток" }).check();

  await drawer.getByRole("button", { name: "Запази" }).click();

  const tempDialog = page.getByRole("dialog", { name: "Временна парола" });
  await expect(tempDialog).toBeVisible({ timeout: 15_000 });
  const tempPassword = (await tempDialog.locator(".font-mono").textContent())?.trim();
  expect(tempPassword).toBeTruthy();
  await tempDialog.getByRole("button", { name: "Готово" }).click();
  await expect(tempDialog).toHaveCount(0);

  return tempPassword!;
}

async function loginFreshUser(
  browser: Browser,
  email: string,
  password: string,
): Promise<Page> {
  const context = await browser.newContext({ locale: "bg-BG" });
  const userPage = await context.newPage();
  await userPage.goto("/login");
  await userPage.getByLabel("Имейл").fill(email);
  await userPage.getByLabel("Парола").fill(password);
  await userPage.getByRole("button", { name: "Вход" }).click();
  return userPage;
}

test.describe("Task 9: users and areas", () => {
  test("admin provisions FIELD user, forced password change, deactivate revokes session", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isPhone = testInfo.project.name === "phone-390";
    const email = `task9-field-${testInfo.project.name}-${Date.now()}@e2e.local`;
    const newPassword = "E2eTask9Field2!";

    await login(page, ADMIN);
    const tempPassword = await createFieldUserWithTwoAreas(page, isPhone, email);

    const fieldPage = await loginFreshUser(browser, email, tempPassword);
    await expect(fieldPage).toHaveURL(/\/change-password/);
    await fieldPage.locator('input[name="currentPassword"]').fill(tempPassword);
    await fieldPage.locator('input[name="newPassword"]').fill(newPassword);
    await fieldPage.locator('input[name="repeatPassword"]').fill(newPassword);
    await fieldPage.getByRole("button", { name: "Запази паролата" }).click();
    await expect(fieldPage).toHaveURL(/\/visits/);

    const fieldNav = await visibleNav(fieldPage, isPhone);
    await expect(fieldNav.getByRole("link", { name: "Посещения" })).toBeVisible();
    await expect(fieldNav.getByRole("link", { name: "Настройки" })).toHaveCount(0);

    // Admin deactivates the user.
    await page.goto("/settings/users");
    await page.getByPlaceholder("Име или имейл").fill(email);
    await expect(page.locator("table tbody").getByText(email)).toBeVisible({ timeout: 15_000 });
    await page.locator("table tbody").getByText(email).click();
    const editDrawer = page.getByRole("dialog", { name: "Редакция на потребител" });
    await editDrawer.getByRole("button", { name: "Деактивиране" }).click();
    await page.getByRole("alertdialog", { name: "Деактивиране на потребител?" }).getByRole("button", { name: "Потвърди" }).click();
    await expect(editDrawer).toHaveCount(0);

    await fieldPage.goto("/visits");
    await expect(fieldPage).toHaveURL(/\/login/);
    await fieldPage.context().close();
  });

  test("admin creates and deactivates an area", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const isPhone = testInfo.project.name === "phone-390";
    const areaName = `E2E-T9-${testInfo.project.name}-${Date.now()}`;

    await login(page, ADMIN);
    await openSettingsUsers(page, isPhone);
    await page.getByRole("tab", { name: "Райони" }).click();
    await expect(page).toHaveURL(/\/settings\/areas/);

    await page.getByRole("button", { name: "Нов район" }).click();
    const createDrawer = page.getByRole("dialog", { name: "Нов район" });
    await createDrawer.getByRole("textbox", { name: "Имезадължително" }).fill(areaName);
    await createDrawer.getByRole("button", { name: "Запази" }).click();
    await expect(createDrawer).toHaveCount(0);

    const areaCell = page.getByRole("cell", { name: areaName, exact: true });
    await expect(areaCell).toBeVisible({ timeout: 15_000 });
    await areaCell.click();

    const editDrawer = page.getByRole("dialog", { name: "Редакция на район" });
    await editDrawer.getByRole("checkbox", { name: "Активен" }).uncheck();
    await editDrawer.getByRole("button", { name: "Запази" }).click();
    await expect(editDrawer).toHaveCount(0);

    const areaCellAfter = page.getByRole("cell", { name: areaName, exact: true });
    await expect(areaCellAfter).toBeVisible({ timeout: 15_000 });
    await areaCellAfter.click();
    await expect(
      page.getByRole("dialog", { name: "Редакция на район" }).getByRole("checkbox", { name: "Активен" }),
    ).not.toBeChecked();
  });
});