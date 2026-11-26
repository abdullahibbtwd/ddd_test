import { expect, test, type Page } from "./fixtures.js";

/**
 * Task 19 Playwright: certificates, agreements, food sampling, GDPR erase.
 * Mix of UI + API helpers for stability (same pattern as products/payments).
 */

const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };
const E2E_SITE = "E2E Сертификати Обект";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

async function visibleNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Основна навигация" });
  if (await nav.isVisible()) return nav;
  await page.getByRole("button", { name: "Отвори менюто" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog.getByRole("navigation", { name: "Основна навигация" });
}

async function findE2eSite(page: Page): Promise<{ id: string; clientId: string }> {
  const res = await page.request.get(
    `/api/sites?search=${encodeURIComponent(E2E_SITE)}&pageSize=20`,
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    items: Array<{ id: string; name: string; client: { id: string } }>;
  };
  const hit = body.items.find((s) => s.name === E2E_SITE);
  if (!hit) throw new Error("E2E Сертификати Обект not found — run seed-e2e-users");
  return { id: hit.id, clientId: hit.client.id };
}

test.describe("compliance OFFICE 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("employee + certificate, renew agreement, food record, export", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "phone-390", "desktop OFFICE flow");
    test.setTimeout(90_000);
    await login(page, OFFICE.email, OFFICE.password);
    await expect(page.getByRole("heading", { level: 1, name: "Табло" })).toBeVisible({
      timeout: 15_000,
    });

    const site = await findE2eSite(page);
    const unique = `E2E P19 ${Date.now()}`;

    const createEmp = await page.request.post("/api/client-employees", {
      data: {
        clientId: site.clientId,
        fullName: unique,
        jobTitle: "Тест",
        siteId: site.id,
      },
    });
    if (createEmp.status() !== 201) {
      throw new Error(`create employee ${createEmp.status()} ${await createEmp.text()}`);
    }
    const emp = (await createEmp.json()) as { id: string };

    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 10);
    const nextStr = next.toISOString().slice(0, 10);
    const last = new Date(next);
    last.setUTCFullYear(last.getUTCFullYear() - 1);
    const cert = await page.request.post("/api/health-certificates", {
      data: {
        clientEmployeeId: emp.id,
        lastCertifiedAt: last.toISOString().slice(0, 10),
        nextRenewalAt: nextStr,
      },
    });
    expect(cert.status()).toBe(201);

    const nav = await visibleNav(page);
    await nav.getByRole("link", { name: "Сертификати" }).click();
    await expect(page.getByTestId("certificates-page")).toBeVisible();
    await page.goto(`/certificates?siteId=${site.id}&expiringWithin=30`);
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText(unique).first().click();
    await expect(page.getByTestId("certificates-export")).toBeVisible();

    const exported = await page.request.get(`/api/client-employees/${emp.id}/export`);
    expect(exported.ok()).toBeTruthy();
    const exportBody = (await exported.json()) as {
      employee: { fullName: string };
    };
    expect(exportBody.employee.fullName).toBe(unique);

    // Agreements renew via UI when an ACTIVE renew button exists
    await page.goto("/agreements");
    await expect(page.getByTestId("agreements-page")).toBeVisible();
    const renewBtn = page.getByTestId("agreements-renew").first();
    if (await renewBtn.isVisible()) {
      await renewBtn.click();
      await expect(page.getByTestId("agreements-renew-dialog")).toBeVisible();
      await expect(page.getByTestId("renew-signed-at")).toBeVisible();
      await expect(page.getByTestId("renew-expires-at")).toBeVisible();
      await page.getByRole("button", { name: "Поднови" }).last().click();
      await page.waitForTimeout(800);
    }

    // Food: create record linked to E2E schedule (trigger advances next_due)
    const schedRes = await page.request.get(
      `/api/food-schedules?siteId=${site.id}&active=true&pageSize=10`,
    );
    expect(schedRes.ok()).toBeTruthy();
    const schedules = (await schedRes.json()) as {
      items: Array<{ id: string; nextDueAt: string }>;
    };
    const schedule = schedules.items[0];
    expect(schedule).toBeTruthy();
    const beforeDue = schedule!.nextDueAt;

    const recordRes = await page.request.post("/api/food-records", {
      data: {
        siteId: site.id,
        scheduleId: schedule!.id,
        collectedAt: beforeDue.slice(0, 10),
        sampleDescription: `E2E проба ${Date.now()}`,
      },
    });
    expect(recordRes.status()).toBe(201);

    const schedAfter = await page.request.get(`/api/food-schedules?siteId=${site.id}&pageSize=10`);
    const afterItems = (await schedAfter.json()) as {
      items: Array<{ id: string; nextDueAt: string }>;
    };
    const updated = afterItems.items.find((s) => s.id === schedule!.id);
    expect(updated?.nextDueAt).not.toBe(beforeDue);

    await page.goto("/food");
    await expect(page.getByTestId("food-page")).toBeVisible();
    await page.getByTestId("food-tab-records").click();
    await expect(page.getByTestId("food-page")).toBeVisible();

    console.log(
      "compliance Playwright groups: OFFICE1440=1 (employee/cert/export/renew/food)",
    );
  });
});

test.describe("compliance ADMIN erase 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("erase employee with reason; anonymized row remains", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "phone-390", "ADMIN erase on desktop");
    test.setTimeout(60_000);
    await login(page, ADMIN.email, ADMIN.password);
    const site = await findE2eSite(page);
    const unique = `E2E Erase ${Date.now()}`;

    const createEmp = await page.request.post("/api/client-employees", {
      data: {
        clientId: site.clientId,
        fullName: unique,
        jobTitle: "Готвач",
        siteId: site.id,
      },
    });
    if (createEmp.status() !== 201) {
      throw new Error(`create employee ${createEmp.status()} ${await createEmp.text()}`);
    }
    const emp = (await createEmp.json()) as { id: string };

    await page.goto(`/certificates?siteId=${site.id}`);
    await expect(page.getByTestId("certificates-page")).toBeVisible();
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText(unique).first().click();
    await page.getByTestId("certificates-erase").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Причина").fill("E2E GDPR erase");
    const eraseRes = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/client-employees/${emp.id}/erase`) &&
        r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Анонимизирай" }).click();
    expect((await eraseRes).ok()).toBeTruthy();

    const erased = await page.request.get(`/api/client-employees/${emp.id}`);
    expect(erased.ok()).toBeTruthy();
    const body = (await erased.json()) as { fullName: string; jobTitle: string | null };
    expect(body.fullName).toBe("[изтрито]");
    expect(body.jobTitle).toBe("[изтрито]");
    await expect(page.getByText("[изтрито]").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("compliance OFFICE 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("certificates list + renew dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-390", "phone OFFICE flow");
    test.setTimeout(60_000);
    await login(page, OFFICE.email, OFFICE.password);
    await page.goto("/certificates");
    await expect(page.getByTestId("certificates-page")).toBeVisible({ timeout: 15_000 });

    await page.goto("/agreements");
    await expect(page.getByTestId("agreements-page")).toBeVisible();
    const renewBtn = page.getByTestId("agreements-renew").first();
    if (await renewBtn.isVisible()) {
      await renewBtn.click();
      await expect(page.getByTestId("agreements-renew-dialog")).toBeVisible();
    }
    console.log("compliance Playwright groups: OFFICE390=1");
  });
});

test.describe("compliance FIELD 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("site drawer shows redacted certified employees", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-390", "phone FIELD flow");
    test.setTimeout(60_000);
    await login(page, FIELD.email, FIELD.password);

    const site = await findE2eSite(page);
    const api = await page.request.get(`/api/sites/${site.id}/certified-employees`);
    expect(api.ok()).toBeTruthy();
    const payload = (await api.json()) as {
      items: Array<{ fullName: string; jobTitle: string }>;
    };
    for (const item of payload.items) {
      expect(item.jobTitle).toBe("[скрито]");
    }

    await page.goto("/sites");
    await expect(page.getByRole("heading", { level: 1, name: "Обекти" })).toBeVisible({
      timeout: 15_000,
    });
    const row = page.getByText(E2E_SITE).first();
    if (await row.isVisible()) {
      await row.click();
      await expect(page.getByTestId("site-certificates-section")).toBeVisible({
        timeout: 10_000,
      });
      const section = page.getByTestId("site-certificates-section");
      if ((await section.getByTestId("site-certified-employee").count()) > 0) {
        await expect(section.getByText("[скрито]").first()).toBeVisible();
        await expect(section.getByText("Управител")).toHaveCount(0);
      }
    }
    console.log("compliance Playwright groups: FIELD390=1");
  });
});
