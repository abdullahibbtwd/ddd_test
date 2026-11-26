import { createId, NotificationKind, NotificationPriority, NotificationRecipientType } from "@ddcrm/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

const evidenceDir = resolve(process.cwd(), "../../docs/evidence/task-20");

describe("notifications DB constraints (Task 20)", () => {
  let db: TestDb;
  let userId: string;
  let clientId: string;
  let entityId: string;

  beforeAll(async () => {
    db = await startTestDb();
    mkdirSync(evidenceDir, { recursive: true });
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
    userId = createId();
    clientId = createId();
    entityId = createId();
    const passwordHash = await hashPassword("test-password-ok");
    await db.prisma.user.create({
      data: {
        id: userId,
        email: "notify-db@test.local",
        name: "Notify",
        role: "ADMIN",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await db.prisma.client.create({
      data: {
        id: clientId,
        kind: "COMPANY",
        name: "Notify Client",
        nameNormalized: "notify client",
        eik: "175074752",
        isActive: true,
        notifyByEmail: false,
      },
    });
  });

  function row(overrides?: Partial<{ id: string; recipientUserId: string | null; recipientClientId: string | null; recipientType: string }>) {
    return {
      id: overrides?.id ?? createId(),
      recipientUserId: overrides && "recipientUserId" in overrides ? overrides.recipientUserId : userId,
      recipientClientId: overrides?.recipientClientId ?? null,
      recipientType: overrides?.recipientType ?? NotificationRecipientType.SYSTEM_USER,
      kind: NotificationKind.CERTIFICATE_EXPIRING,
      entityType: "health_certificates",
      entityId,
      thresholdDay: 30,
      priority: NotificationPriority.NORMAL,
      titleI18nKey: "kinds.CERTIFICATE_EXPIRING.title",
      bodyI18nKey: "kinds.CERTIFICATE_EXPIRING.body",
      bodyParams: { siteName: "Кухня", expiresAt: "2026-07-15" },
    };
  }

  it("partial UNIQUE rejects a duplicate (recipient, kind, entity, threshold)", async () => {
    await db.prisma.notification.create({ data: row({ id: createId() }) });
    await expect(db.prisma.notification.create({ data: row({ id: createId() }) })).rejects.toThrow(
      /Unique constraint|P2002|23505/,
    );
  });

  it("UPDATE of content is rejected; read_at is allowed", async () => {
    const id = createId();
    await db.prisma.notification.create({ data: row({ id }) });
    await expect(
      db.prisma.notification.update({
        where: { id },
        data: { kind: NotificationKind.INVOICE_OVERDUE },
      }),
    ).rejects.toThrow(/23P06|immutable/);
    const updated = await db.prisma.notification.update({
      where: { id },
      data: { readAt: new Date("2026-06-15T07:00:00.000Z") },
    });
    expect(updated.readAt).not.toBeNull();
  });

  it("DELETE is rejected (23P06)", async () => {
    const id = createId();
    await db.prisma.notification.create({ data: row({ id }) });
    await expect(db.prisma.notification.delete({ where: { id } })).rejects.toThrow(/23P06|DELETE rejected/);
    const still = await db.prisma.notification.findUnique({ where: { id } });
    expect(still).not.toBeNull();
  });

  it("recipient CHECK enforces id-null symmetry", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- CHECK constraint proof
      db.prisma.$executeRawUnsafe(
        `INSERT INTO notifications (
           id, recipient_user_id, recipient_client_id, recipient_type,
           kind, entity_type, entity_id, threshold_day, priority,
           title_i18n_key, body_i18n_key, body_params
         ) VALUES (
           $1::uuid, NULL, NULL, 'SYSTEM_USER',
           'CERTIFICATE_EXPIRING', 'health_certificates', $2::uuid, 30, 'NORMAL',
           'kinds.CERTIFICATE_EXPIRING.title', 'kinds.CERTIFICATE_EXPIRING.body', '{}'::jsonb
         )`,
        createId(),
        entityId,
      ),
    ).rejects.toThrow(/23514|check/i);
  });

  it("email_events accepts kind NOTIFICATION with a notification_id", async () => {
    const id = createId();
    await db.prisma.notification.create({ data: row({ id }) });
    const event = await db.prisma.emailEvent.create({
      data: {
        id: createId(),
        invoiceId: null,
        notificationId: id,
        kind: "NOTIFICATION",
        toAddress: "notify-db@test.local",
        jobId: `notification_email_${id}`,
      },
    });
    expect(event.kind).toBe("NOTIFICATION");
    expect(event.notificationId).toBe(id);
    writeFileSync(
      resolve(evidenceDir, "sql-evidence.json"),
      JSON.stringify(
        {
          partialUnique: "second insert of the same (user, kind, entity, threshold) → 23505",
          contentUpdate: "UPDATE kind → 23P06; UPDATE read_at allowed",
          delete: "DELETE → 23P06, row remains",
          recipientCheck: "SYSTEM_USER with both ids null → 23514",
          emailEvent: { kind: event.kind, notificationId: event.notificationId, jobId: event.jobId },
        },
        null,
        2,
      ),
    );
  });

  it("client-contact partial unique is independent of the user key", async () => {
    const data = {
      recipientUserId: null,
      recipientClientId: clientId,
      recipientType: NotificationRecipientType.CLIENT_CONTACT,
    };
    await db.prisma.notification.create({ data: row({ id: createId(), ...data }) });
    await expect(
      db.prisma.notification.create({ data: row({ id: createId(), ...data }) }),
    ).rejects.toThrow(/Unique constraint|P2002|23505/);
  });
});
