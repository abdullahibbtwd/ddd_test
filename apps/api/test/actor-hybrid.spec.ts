import { createId, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getActorContext,
  runWithActorContextAsync,
} from "../src/audit/actor-context";
import { hashPassword } from "../src/auth/password";
import { createAppPrisma } from "../src/prisma/create-prisma";
import { startTestDb, type TestDb } from "./helpers/db";

const password = "correct-horse-battery";

describe("hybrid actor context", () => {
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

  it("rolls back interactive transaction: no data, no audit rows", async () => {
    const prisma = createAppPrisma(db.connectionString);
    try {
      await runWithActorContextAsync(
        {
          source: "api",
          actorUserId: "00000000-0000-7000-8000-000000000099",
          requestId: "rb",
          ip: null,
        },
        async () => {
          await expect(
            prisma.transaction(async (tx) => {
              await tx.user.create({
                data: {
                  id: createId(),
                  email: "rollback@example.com",
                  name: "Rollback",
                  role: Role.ADMIN,
                  passwordHash: await hashPassword(password),
                  passwordChangedAt: new Date(),
                },
              });
              throw new Error("boom");
            }),
          ).rejects.toThrow("boom");
        },
      );
      expect(await db.prisma.user.count()).toBe(0);
      expect(await db.prisma.auditLog.count()).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("interactive transaction with 3 writes shares the actor", async () => {
    const prisma = createAppPrisma(db.connectionString);
    const actor = "00000000-0000-7000-8000-000000000003";
    try {
      await runWithActorContextAsync(
        { source: "api", actorUserId: actor, requestId: "t3", ip: "10.0.0.1" },
        async () => {
          await prisma.transaction(async (tx) => {
            for (let i = 0; i < 3; i += 1) {
              await tx.user.create({
                data: {
                  id: createId(),
                  email: `three-${i}@example.com`,
                  name: `T${i}`,
                  role: Role.FIELD,
                  passwordHash: await hashPassword(password),
                  passwordChangedAt: new Date(),
                },
              });
            }
          });
        },
      );
      const rows = await db.prisma.auditLog.findMany({
        where: { action: "CREATE" },
      });
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.actorUserId).toBe(actor);
        expect(row.source).toBe("api");
        expect(row.ip).toBe("10.0.0.1");
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("nested transaction() reuses the outer; outer rollback undoes inner writes", async () => {
    const prisma = createAppPrisma(db.connectionString);
    try {
      await runWithActorContextAsync(
        { source: "cli", actorLabel: "cli:nest", requestId: null, ip: null },
        async () => {
          await expect(
            prisma.transaction(async (tx) => {
              await tx.user.create({
                data: {
                  id: createId(),
                  email: "outer@example.com",
                  name: "Outer",
                  role: Role.ADMIN,
                  passwordHash: await hashPassword(password),
                  passwordChangedAt: new Date(),
                },
              });
              await prisma.transaction(async (inner) => {
                await inner.user.create({
                  data: {
                    id: createId(),
                    email: "inner@example.com",
                    name: "Inner",
                    role: Role.ADMIN,
                    passwordHash: await hashPassword(password),
                    passwordChangedAt: new Date(),
                  },
                });
              });
              throw new Error("outer-boom");
            }),
          ).rejects.toThrow("outer-boom");
        },
      );
      expect(await db.prisma.user.count()).toBe(0);
      expect(await db.prisma.auditLog.count()).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("single write inside transaction() is not double-wrapped (outer rollback cleans it)", async () => {
    const prisma = createAppPrisma(db.connectionString);
    try {
      await runWithActorContextAsync(
        { source: "api", actorUserId: null, requestId: "dw", ip: null },
        async () => {
          await expect(
            prisma.transaction(async (tx) => {
              // This create must NOT commit via a nested batch transaction.
              await tx.user.create({
                data: {
                  id: createId(),
                  email: "nowrap@example.com",
                  name: "NoWrap",
                  role: Role.OFFICE,
                  passwordHash: await hashPassword(password),
                  passwordChangedAt: new Date(),
                },
              });
              throw new Error("prove-no-double-wrap");
            }),
          ).rejects.toThrow("prove-no-double-wrap");
        },
      );
      expect(await db.prisma.user.count()).toBe(0);
      expect(await db.prisma.auditLog.count()).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("50 parallel writes with 5 actors; read-only context does not leak", async () => {
    const prisma = createAppPrisma(db.connectionString);
    const actors = Array.from({ length: 5 }, (_, i) =>
      `00000000-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    try {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) => {
          const actorUserId = actors[i % actors.length]!;
          return runWithActorContextAsync(
            { source: "api", actorUserId, requestId: `p-${i}`, ip: null },
            async () => {
              await prisma.user.create({
                data: {
                  id: createId(),
                  email: `parallel-${i}@example.com`,
                  name: `P${i}`,
                  role: Role.FIELD,
                  passwordHash: await hashPassword(password),
                  passwordChangedAt: new Date(),
                },
              });
            },
          );
        }),
      );

      const rows = await db.prisma.auditLog.findMany({
        where: { action: "CREATE" },
      });
      expect(rows).toHaveLength(50);
      for (const row of rows) {
        const email = (row.after as { email?: string } | null)?.email;
        const idx = Number(email!.match(/parallel-(\d+)/)?.[1]);
        expect(row.actorUserId).toBe(actors[idx % actors.length]);
      }

      await runWithActorContextAsync(
        { source: "api", actorUserId: null, requestId: "readonly", ip: null },
        async () => {
          await prisma.user.findMany({ take: 1 });
          expect(getActorContext()?.actorUserId ?? null).toBeNull();
        },
      );

      // Prove DB settings did not leak onto a subsequent write without context
      // after a read-only context: a no-context write is source=system.
      const before = await db.prisma.auditLog.count();
      await prisma.user.create({
        data: {
          id: createId(),
          email: "after-readonly@example.com",
          name: "After",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      });
      const leaked = await db.prisma.auditLog.findFirst({
        where: { action: "CREATE" },
        orderBy: { occurredAt: "desc" },
      });
      expect(await db.prisma.auditLog.count()).toBe(before + 1);
      expect(leaked?.source).toBe("system");
      expect(leaked?.actorUserId).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });
});
