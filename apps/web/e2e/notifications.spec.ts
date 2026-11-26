import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "./fixtures.js";

const execFileAsync = promisify(execFile);

const ADMIN = { email: "admin@e2e.local", password: "E2eAdminPass1!" };
const OFFICE = { email: "office@e2e.local", password: "E2eOfficePass1!" };
const FIELD = { email: "field@e2e.local", password: "E2eFieldPass1!" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

function bell(page: Page) {
  return page.locator("[data-testid=notification-bell]:visible");
}

async function unreadCount(page: Page): Promise<number> {
  const badge = page.locator("[data-testid=notification-bell-count]:visible");
  await expect(badge).toBeVisible();
  return Number(await badge.textContent());
}

test.describe("notifications", () => {
  test("ADMIN 1440 bell, navigation, mark all, summary", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop bell popover");
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, ADMIN.email, ADMIN.password);
    const before = await unreadCount(page);
    expect(before).toBeGreaterThan(0);
    await bell(page).click();
    await expect(page.getByTestId("notification-popover")).toBeVisible();
    await page.getByTestId("notification-item-INVOICE_OVERDUE").filter({ hasText: "E2E-N-INV" }).click();
    await expect(page).toHaveURL(/\/invoices\//);
    await expect.poll(() => unreadCount(page)).toBeLessThan(before);

    await page.goto("/notifications");
    await expect(page.getByTestId("notifications-page")).toBeVisible();
    await expect(page.getByTestId("notifications-summary")).toBeVisible();
    await page.getByTestId("notifications-mark-all").click();
    await expect(page.getByTestId("notification-bell-count")).toHaveCount(0);
    console.log("ADMIN1440=1");
  });

  test("OFFICE 390 bottom sheet and list", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-390", "phone sheet");
    await login(page, OFFICE.email, OFFICE.password);
    await bell(page).click();
    await expect(page.getByTestId("notification-bell-sheet")).toBeVisible();
    await page.getByTestId("notification-item-FOOD_SCHEDULE_DUE").click();
    await expect(page).toHaveURL(/\/food/);
    await page.goto("/notifications");
    await expect(page.getByTestId("notifications-page")).toBeVisible();
    await expect(page.getByTestId("notifications-summary")).toHaveCount(0);
    console.log("OFFICE390=1");
  });

  test("FIELD 390 sees only their bell and no summary", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-390", "phone field");
    await login(page, FIELD.email, FIELD.password);
    await bell(page).click();
    await expect(page.getByTestId("notification-bell-sheet")).toBeVisible();
    await expect(page.getByText(/E2E-N-FIELD/)).toBeVisible();
    await expect(page.getByText(/E2E-N-INV/)).toHaveCount(0);
    await page.goto("/notifications");
    await expect(page.getByTestId("notifications-summary")).toHaveCount(0);
    console.log("FIELD390=1");
  });

  test("CLIENT_CONTACT email via sweep and admin summary count", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "mailpit once");
    test.setTimeout(120_000);
    await execFileAsync(
      "pnpm",
      ["--filter", "@ddcrm/api", "exec", "tsx", "scripts/run-notification-sweep.ts"],
      {
        cwd: process.cwd().endsWith("/apps/web")
          ? process.cwd().slice(0, -"/apps/web".length)
          : process.cwd(),
      },
    );
    const list = await fetch("http://127.0.0.1:8025/api/v1/search?query=e2e-notify-yes%40e2e.local");
    expect(list.ok).toBeTruthy();
    const body = (await list.json()) as {
      messages?: Array<{ ID: string; Subject: string }>;
    };
    const hit = (body.messages ?? []).find((m) => m.Subject.includes("Вашият договор"));
    expect(hit).toBeTruthy();
    const detail = await fetch(`http://127.0.0.1:8025/api/v1/message/${hit!.ID}`);
    const message = (await detail.json()) as { Text?: string; HTML?: string };
    expect(message.Text ?? message.HTML ?? "").toMatch(/E2E Сертификати Обект|изтича/);
    const evidence = path.resolve(
      process.cwd().endsWith("/apps/web") ? path.resolve(process.cwd(), "..") : process.cwd(),
      "docs/evidence/task-20",
    );
    mkdirSync(evidence, { recursive: true });
    writeFileSync(
      path.join(evidence, "mail-agreement-client.html"),
      message.HTML ?? message.Text ?? "",
    );
    const certList = await fetch("http://127.0.0.1:8025/api/v1/search?query=subject:%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D0%B5%D0%BD");
    if (certList.ok) {
      const certBody = (await certList.json()) as { messages?: Array<{ ID: string }> };
      const cert = certBody.messages?.[0];
      if (cert) {
        const certDetail = await fetch(`http://127.0.0.1:8025/api/v1/message/${cert.ID}`);
        const certMessage = (await certDetail.json()) as { HTML?: string; Text?: string };
        writeFileSync(
          path.join(evidence, "mail-certificate-user.html"),
          certMessage.HTML ?? certMessage.Text ?? "",
        );
      }
    }

    const no = await fetch("http://127.0.0.1:8025/api/v1/search?query=e2e-notify-no%40e2e.local");
    const noBody = (await no.json()) as { messages?: Array<{ Subject: string }> };
    expect(
      (noBody.messages ?? []).filter((m) => m.Subject.includes("Вашият договор")),
    ).toHaveLength(0);

    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/notifications");
    const cell = page.getByTestId("summary-client-AGREEMENT_EXPIRING");
    await expect(cell).toBeVisible();
    await expect(cell).not.toHaveText("0");
    console.log("CLIENT_EMAIL=1");
  });
});
