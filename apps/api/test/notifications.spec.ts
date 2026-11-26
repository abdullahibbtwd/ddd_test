import {
  createId,
  NotificationKind,
  NotificationPriority,
  NotificationRecipientType,
  Role,
} from "@ddcrm/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { NOTIFICATION_SYSTEM_LABEL } from "../src/notifications/system-actor";
import {
  cookieHeader,
  parseCookies,
  startAuthTestApp,
  stopAuthTestApp,
  type AuthTestContext,
} from "./helpers/auth-app";

const evidenceDir = resolve(process.cwd(), "../../docs/evidence/task-20");

describe("notifications API (Task 20)", () => {
  let ctx: AuthTestContext;
  let adminId: string;
  let officeId: string;
  let fieldId: string;
  let clientId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
    mkdirSync(evidenceDir, { recursive: true });
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  async function login(email: string): Promise<string> {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "Password1!" },
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    return cookieHeader(parseCookies(res.headers["set-cookie"]));
  }

  beforeEach(async () => {
    await ctx.db.resetDb();
    adminId = createId();
    officeId = createId();
    fieldId = createId();
    clientId = createId();
    const passwordHash = await hashPassword("Password1!");
    for (const user of [
      { id: adminId, email: "admin-n@test.local", role: Role.ADMIN },
      { id: officeId, email: "office-n@test.local", role: Role.OFFICE },
      { id: fieldId, email: "field-n@test.local", role: Role.FIELD },
    ]) {
      await ctx.db.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.role,
          role: user.role,
          passwordHash,
          passwordChangedAt: new Date(),
        },
      });
    }
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: "COMPANY",
        name: "Клиент",
        nameNormalized: "клиент",
        eik: "175074752",
        notifyByEmail: true,
        isActive: true,
      },
    });

    const base = {
      entityType: "health_certificates",
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.CERTIFICATE_EXPIRING.title",
      bodyI18nKey: "kinds.CERTIFICATE_EXPIRING.body",
      bodyParams: { siteName: "Кухня", expiresAt: "2026-07-15" },
      thresholdDay: 30,
      recipientType: NotificationRecipientType.SYSTEM_USER,
    };
    await ctx.db.prisma.notification.create({
      data: {
        ...base,
        id: createId(),
        recipientUserId: adminId,
        kind: NotificationKind.CERTIFICATE_EXPIRING,
        entityId: createId(),
      },
    });
    await ctx.db.prisma.notification.create({
      data: {
        ...base,
        id: createId(),
        recipientUserId: adminId,
        kind: NotificationKind.INVOICE_OVERDUE,
        entityType: "invoices",
        entityId: createId(),
        thresholdDay: 0,
        priority: NotificationPriority.HIGH,
        titleI18nKey: "kinds.INVOICE_OVERDUE.title",
        bodyI18nKey: "kinds.INVOICE_OVERDUE.body",
        bodyParams: { invoiceNumber: "0000000001", dueDate: "2026-06-01" },
        readAt: new Date("2026-06-15T08:00:00.000Z"),
      },
    });
    await ctx.db.prisma.notification.create({
      data: {
        ...base,
        id: createId(),
        recipientUserId: adminId,
        kind: NotificationKind.FOOD_SCHEDULE_DUE,
        entityType: "food_sampling_schedules",
        entityId: createId(),
        thresholdDay: 0,
        titleI18nKey: "kinds.FOOD_SCHEDULE_DUE.title",
        bodyI18nKey: "kinds.FOOD_SCHEDULE_DUE.body",
        bodyParams: { siteName: "Кухня", dueDate: "2026-06-15" },
        dismissedAt: new Date("2026-06-15T09:00:00.000Z"),
      },
    });
    await ctx.db.prisma.notification.create({
      data: {
        ...base,
        id: createId(),
        recipientUserId: fieldId,
        kind: NotificationKind.FOOD_SCHEDULE_DUE,
        entityType: "food_sampling_schedules",
        entityId: createId(),
        thresholdDay: 0,
        titleI18nKey: "kinds.FOOD_SCHEDULE_DUE.title",
        bodyI18nKey: "kinds.FOOD_SCHEDULE_DUE.body",
        bodyParams: { siteName: "Обект на терен", dueDate: "2026-06-15" },
      },
    });
    await ctx.db.prisma.notification.create({
      data: {
        id: createId(),
        recipientUserId: null,
        recipientClientId: clientId,
        recipientType: NotificationRecipientType.CLIENT_CONTACT,
        kind: NotificationKind.AGREEMENT_EXPIRING,
        entityType: "agreements",
        entityId: createId(),
        thresholdDay: 30,
        priority: NotificationPriority.NORMAL,
        titleI18nKey: "kinds.AGREEMENT_EXPIRING.title",
        bodyI18nKey: "clientBody.AGREEMENT_EXPIRING",
        bodyParams: { siteName: "Кухня", expiresAt: "2026-07-15" },
      },
    });
  });

  it("scopes /me, read, dismiss, read-all, and summary", async () => {
    const admin = await login("admin-n@test.local");
    const field = await login("field-n@test.local");
    const office = await login("office-n@test.local");
    const headers = (cookie: string) => ({
      origin: "http://localhost:5173",
      cookie,
    });

    const mine = await ctx.inject({
      method: "GET",
      url: "/api/notifications/me?unreadOnly=false",
      headers: headers(admin),
    });
    expect(mine.statusCode).toBe(200);
    const page = mine.json() as { items: Array<{ kind: string; dismissedAt: string | null }> };
    expect(page.items.map((i) => i.kind).sort()).toEqual([
      "CERTIFICATE_EXPIRING",
      "INVOICE_OVERDUE",
    ]);
    expect(page.items.every((i) => i.dismissedAt === null)).toBe(true);

    const unread = await ctx.inject({
      method: "GET",
      url: "/api/notifications/me",
      headers: headers(admin),
    });
    const unreadBody = unread.json() as { items: Array<{ id: string; kind: string }> };
    expect(unreadBody.items).toHaveLength(1);
    expect(unreadBody.items[0]?.kind).toBe("CERTIFICATE_EXPIRING");

    const fieldMine = await ctx.inject({
      method: "GET",
      url: "/api/notifications/me?unreadOnly=false",
      headers: headers(field),
    });
    const fieldItems = fieldMine.json() as { items: Array<{ kind: string; bodyParams: { siteName?: string } }> };
    expect(fieldItems.items).toHaveLength(1);
    expect(fieldItems.items[0]?.bodyParams.siteName).toBe("Обект на терен");

    const id = unreadBody.items[0]!.id;
    const read1 = await ctx.inject({
      method: "POST",
      url: `/api/notifications/${id}/read`,
      headers: headers(admin),
    });
    expect(read1.statusCode).toBe(200);
    const read2 = await ctx.inject({
      method: "POST",
      url: `/api/notifications/${id}/read`,
      headers: headers(admin),
    });
    expect(read2.statusCode).toBe(200);
    expect(read2.json().readAt).toBeTruthy();

    const other = await ctx.inject({
      method: "POST",
      url: `/api/notifications/${id}/read`,
      headers: headers(field),
    });
    expect(other.statusCode).toBe(404);
    expect(other.json().code).toBe("NOTIFICATION_NOT_FOUND");
    expect(String(other.json().message)).not.toMatch(/@|Кухня|admin/);

    const fieldList = fieldMine.json() as { items: Array<{ id: string }> };
    const dismiss1 = await ctx.inject({
      method: "POST",
      url: `/api/notifications/${fieldList.items[0]!.id}/dismiss`,
      headers: headers(field),
    });
    expect(dismiss1.statusCode).toBe(200);
    const dismiss2 = await ctx.inject({
      method: "POST",
      url: `/api/notifications/${fieldList.items[0]!.id}/dismiss`,
      headers: headers(field),
    });
    expect(dismiss2.statusCode).toBe(409);
    expect(dismiss2.json().code).toBe("NOTIFICATION_ALREADY_DISMISSED");

    await ctx.db.prisma.notification.create({
      data: {
        id: createId(),
        recipientUserId: adminId,
        recipientType: NotificationRecipientType.SYSTEM_USER,
        kind: NotificationKind.AGREEMENT_EXPIRING,
        entityType: "agreements",
        entityId: createId(),
        thresholdDay: 14,
        priority: NotificationPriority.NORMAL,
        titleI18nKey: "kinds.AGREEMENT_EXPIRING.title",
        bodyI18nKey: "kinds.AGREEMENT_EXPIRING.body",
        bodyParams: { siteName: "Кухня", expiresAt: "2026-06-29" },
      },
    });
    const all = await ctx.inject({
      method: "POST",
      url: "/api/notifications/read-all",
      headers: headers(admin),
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().count).toBe(1);
    const again = await ctx.inject({
      method: "POST",
      url: "/api/notifications/read-all",
      headers: headers(admin),
    });
    expect(again.json().count).toBe(0);

    const summary = await ctx.inject({
      method: "GET",
      url: "/api/notifications/summary",
      headers: headers(admin),
    });
    expect(summary.statusCode).toBe(200);
    const summaryBody = summary.json() as {
      kinds: Array<{ kind: string; clientContact: number }>;
      clientContactTotal: number;
    };
    expect(JSON.stringify(summaryBody)).not.toMatch(/siteName|Кухня|@/);
    expect(summaryBody.clientContactTotal).toBe(1);

    for (const cookie of [office, field]) {
      const denied = await ctx.inject({
        method: "GET",
        url: "/api/notifications/summary",
        headers: headers(cookie),
      });
      expect(denied.statusCode).toBe(403);
    }

    const reads = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "notifications", action: "UPDATE", actorUserId: adminId },
    });
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((row) => row.actorLabel !== NOTIFICATION_SYSTEM_LABEL)).toBe(true);

    const stored = await ctx.db.prisma.notification.findMany({
      where: { recipientUserId: adminId },
      orderBy: { createdAt: "asc" },
      select: { kind: true, readAt: true, dismissedAt: true, bodyParams: true },
    });
    writeFileSync(
      resolve(evidenceDir, "me-dump.json"),
      JSON.stringify(
        {
          apiUnreadOnlyFalse: page,
          storedForAdmin: stored,
          note: "API hides dismissed and CLIENT_CONTACT. Stored rows include one read invoice and one dismissed food schedule.",
        },
        null,
        2,
      ),
    );
  });
});
