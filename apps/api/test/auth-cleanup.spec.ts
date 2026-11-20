import { createId, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteExpiredAuthSessions } from "../src/auth/cleanup-expired-sessions";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

describe("auth sessions cleanup", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
  });

  it("deletes only sessions expired more than 7 days ago", async () => {
    const now = new Date("2026-11-20T12:00:00.000Z");
    const user = await db.prisma.user.create({
      data: {
        id: createId(),
        email: "cleanup@example.com",
        name: "Cleanup",
        role: Role.ADMIN,
        passwordHash: await hashPassword("long-enough-password"),
        passwordChangedAt: now,
      },
    });

    const mk = async (expiresAt: Date) =>
      db.prisma.authSession.create({
        data: {
          id: createId(),
          userId: user.id,
          familyId: createId(),
          tokenHash: createId(),
          familyStartedAt: now,
          expiresAt,
        },
      });

    const keepRecent = await mk(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)); // 3 days ago
    const keepBorder = await mk(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)); // exactly 7 days
    const deleteOld = await mk(new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)); // 8 days ago

    const deleted = await deleteExpiredAuthSessions(db.prisma, 7, now);
    expect(deleted).toBe(1);

    const remaining = await db.prisma.authSession.findMany({ select: { id: true } });
    const ids = remaining.map((r) => r.id).sort();
    expect(ids).toEqual([keepBorder.id, keepRecent.id].sort());
    expect(ids).not.toContain(deleteOld.id);

    // Idempotent
    expect(await deleteExpiredAuthSessions(db.prisma, 7, now)).toBe(0);
  });
});
