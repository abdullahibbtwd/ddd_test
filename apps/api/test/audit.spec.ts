import { createId, ErrorCode, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runWithActorContextAsync } from "../src/audit/actor-context";
import { hashPassword } from "../src/auth/password";
import { createAppPrisma } from "../src/prisma/create-prisma";
import {
  cookieHeader,
  parseCookies,
  startAuthTestApp,
  stopAuthTestApp,
  type AuthTestContext,
} from "./helpers/auth-app";

describe("audit log", () => {
  let ctx: AuthTestContext;
  const password = "correct-horse-battery";

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
  });

  async function createUser(email: string, role: Role = Role.ADMIN) {
    return ctx.db.prisma.user.create({
      data: {
        id: createId(),
        email,
        name: email.split("@")[0]!,
        role,
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
      },
    });
  }

  function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
    const raw = res.headers["set-cookie"];
    if (!raw) return [];
    return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
  }

  async function loginCookies(email: string, pwd = password) {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email, password: pwd },
    });
    expect(res.statusCode).toBe(200);
    return parseCookies(getSetCookie(res));
  }

  it("insert/update/delete user produce audit rows with before/after and changed_fields", async () => {
    const prisma = createAppPrisma(ctx.db.connectionString);
    try {
      await runWithActorContextAsync(
        {
          source: "api",
          actorUserId: "00000000-0000-7000-8000-000000000001",
          actorLabel: null,
          requestId: "req-1",
          ip: "127.0.0.1",
        },
        async () => {
          const id = createId();
          await prisma.user.create({
            data: {
              id,
              email: "audit-user@example.com",
              name: "Audit",
              role: Role.OFFICE,
              passwordHash: await hashPassword(password),
              passwordChangedAt: new Date(),
            },
          });
          await prisma.user.update({
            where: { id },
            data: { name: "Audit Updated", phone: "0888" },
          });
          await prisma.user.delete({ where: { id } });
        },
      );

      const rows = await ctx.db.prisma.auditLog.findMany({
        where: { entityType: "users" },
        orderBy: { occurredAt: "asc" },
      });
      expect(rows.map((r) => r.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
      expect(rows[0]?.after).toMatchObject({ email: "audit-user@example.com", name: "Audit" });
      expect(rows[1]?.changedFields).toEqual(expect.arrayContaining(["name", "phone"]));
      expect(rows[1]?.before).toMatchObject({ name: "Audit" });
      expect(rows[1]?.after).toMatchObject({ name: "Audit Updated", phone: "0888" });
      expect(rows[2]?.before).toMatchObject({ name: "Audit Updated" });
      expect(rows[0]?.actorUserId).toBe("00000000-0000-7000-8000-000000000001");
      expect(rows[0]?.source).toBe("api");
    } finally {
      await prisma.$disconnect();
    }
  });

  it("password_hash never appears in snapshots but is listed in changed_fields", async () => {
    const user = await createUser("pwd@example.com");
    const prisma = createAppPrisma(ctx.db.connectionString);
    try {
      await runWithActorContextAsync(
        { source: "api", actorUserId: user.id, requestId: "r", ip: null },
        async () => {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              passwordHash: await hashPassword("new-password-here"),
              passwordChangedAt: new Date(),
            },
          });
        },
      );
      const row = await ctx.db.prisma.auditLog.findFirst({
        where: { action: "UPDATE", entityId: user.id },
        orderBy: { occurredAt: "desc" },
      });
      expect(row?.changedFields).toEqual(
        expect.arrayContaining(["password_hash", "password_changed_at"]),
      );
      expect(JSON.stringify(row?.before)).not.toMatch(/password_hash|argon|argon2/i);
      expect(JSON.stringify(row?.after)).not.toMatch(/password_hash|argon|argon2/i);
      expect(row?.before).not.toHaveProperty("password_hash");
      expect(row?.after).not.toHaveProperty("password_hash");
    } finally {
      await prisma.$disconnect();
    }
  });

  it("updates that only touch ignored columns produce no audit row", async () => {
    const user = await createUser("ignore@example.com");
    const beforeCount = await ctx.db.prisma.auditLog.count();
    // eslint-disable-next-line no-restricted-syntax -- test exercises DB trigger via raw UPDATE
    await ctx.db.prisma.$executeRaw`
      UPDATE users SET last_login_at = NOW(), failed_login_count = 1,
        locked_until = NOW() + interval '1 minute', updated_at = NOW()
      WHERE id = ${user.id}::uuid
    `;
    expect(await ctx.db.prisma.auditLog.count()).toBe(beforeCount);
  });

  it("interactive transaction createMany updateMany deleteMany upsert are captured", async () => {
    const prisma = createAppPrisma(ctx.db.connectionString);
    try {
      await runWithActorContextAsync(
        { source: "cli", actorLabel: "cli:test", actorUserId: null, requestId: null, ip: null },
        async () => {
          const id1 = createId();
          const id2 = createId();
          await prisma.transaction(async (tx) => {
            await tx.user.create({
              data: {
                id: id1,
                email: "tx1@example.com",
                name: "Tx1",
                role: Role.ADMIN,
                passwordHash: await hashPassword(password),
                passwordChangedAt: new Date(),
              },
            });
          });

          await prisma.user.createMany({
            data: [
              {
                id: id2,
                email: "many@example.com",
                name: "Many",
                role: Role.FIELD,
                passwordHash: await hashPassword(password),
                passwordChangedAt: new Date(),
              },
            ],
          });

          await prisma.user.updateMany({
            where: { id: id2 },
            data: { name: "Many2" },
          });

          await prisma.user.upsert({
            where: { email: "upsert@example.com" },
            create: {
              id: createId(),
              email: "upsert@example.com",
              name: "Upsert",
              role: Role.OFFICE,
              passwordHash: await hashPassword(password),
              passwordChangedAt: new Date(),
            },
            update: { name: "Upserted" },
          });

          await prisma.user.deleteMany({ where: { id: id1 } });
        },
      );

      const actions = await ctx.db.prisma.auditLog.findMany({
        where: { entityType: "users" },
        select: { action: true },
      });
      expect(actions.some((a) => a.action === "CREATE")).toBe(true);
      expect(actions.some((a) => a.action === "UPDATE")).toBe(true);
      expect(actions.some((a) => a.action === "DELETE")).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("a write with no context is recorded as source system with null actor", async () => {
    const prisma = createAppPrisma(ctx.db.connectionString);
    try {
      await prisma.user.create({
        data: {
          id: createId(),
          email: "nocxt@example.com",
          name: "NoCtx",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      });
      const row = await ctx.db.prisma.auditLog.findFirst({
        where: { action: "CREATE", entityType: "users" },
        orderBy: { occurredAt: "desc" },
      });
      expect(row?.source).toBe("system");
      expect(row?.actorUserId).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  it("append-only: UPDATE, DELETE and TRUNCATE of audit_log are rejected", async () => {
    await createUser("append@example.com");
    await loginCookies("append@example.com");
    const row = await ctx.db.prisma.auditLog.findFirst();
    expect(row).toBeTruthy();

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- proving append-only trigger
      ctx.db.prisma.$executeRawUnsafe(
        `UPDATE audit_log SET action = 'HACK' WHERE id = '${row!.id}'`,
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- proving append-only trigger
      ctx.db.prisma.$executeRawUnsafe(`DELETE FROM audit_log WHERE id = '${row!.id}'`),
    ).rejects.toThrow(/append-only/i);

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- proving append-only trigger
      ctx.db.prisma.$executeRawUnsafe(`TRUNCATE audit_log`),
    ).rejects.toThrow(/append-only/i);
  });

  it("explicit security events: login, failed login, logout, password, lockout, refresh reuse", async () => {
    const user = await createUser("sec@example.com");

    await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "unknown-sec@example.com", password },
    });
    const unknownFail = await ctx.db.prisma.auditLog.findFirst({
      where: { action: "LOGIN_FAILED", actorUserId: null },
      orderBy: { occurredAt: "desc" },
    });
    expect(unknownFail?.meta).toMatchObject({ reason: "unknown_email" });
    expect(JSON.stringify(unknownFail)).not.toMatch(/unknown-sec@example.com/);

    await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "sec@example.com", password: "wrong-password-xx" },
    });
    expect(
      await ctx.db.prisma.auditLog.count({
        where: { action: "LOGIN_FAILED", actorUserId: user.id },
      }),
    ).toBeGreaterThan(0);

    const cookies = await loginCookies("sec@example.com");
    expect(
      await ctx.db.prisma.auditLog.count({
        where: { action: "LOGIN_SUCCESS", actorUserId: user.id },
      }),
    ).toBeGreaterThan(0);

    const changed = await ctx.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: {
        origin: "http://localhost:5173",
        cookie: cookieHeader(cookies),
      },
      payload: { currentPassword: password, newPassword: "Brand-New-Pass1!" },
    });
    expect(changed.statusCode).toBe(200);
    expect(
      await ctx.db.prisma.auditLog.count({
        where: { action: "PASSWORD_CHANGED", actorUserId: user.id },
      }),
    ).toBeGreaterThan(0);

    const cookiesAfterChange = parseCookies(getSetCookie(changed));
    await ctx.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "http://localhost:5173",
        cookie: cookieHeader(cookiesAfterChange),
      },
    });
    expect(
      await ctx.db.prisma.auditLog.count({
        where: { action: "LOGOUT", actorUserId: user.id },
      }),
    ).toBeGreaterThan(0);

    const lockUser = await createUser("lock@example.com");
    for (let i = 0; i < 10; i += 1) {
      await ctx.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: "http://localhost:5173" },
        payload: { email: "lock@example.com", password: "wrong-password-xx" },
      });
    }
    expect(
      await ctx.db.prisma.auditLog.count({
        where: { action: "ACCOUNT_LOCKED", actorUserId: lockUser.id },
      }),
    ).toBeGreaterThan(0);

    const reuseUser = await createUser("reuse@example.com");
    const loginRes = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "reuse@example.com", password },
    });
    const reuseCookies = parseCookies(getSetCookie(loginRes));
    const refreshToken = reuseCookies.refresh_token;
    expect(refreshToken).toBeTruthy();

    await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        origin: "http://localhost:5173",
        cookie: `refresh_token=${refreshToken}`,
      },
    });
    await new Promise((r) => setTimeout(r, 11_000));
    await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        origin: "http://localhost:5173",
        cookie: `refresh_token=${refreshToken}`,
      },
    });
    expect(
      await ctx.db.prisma.auditLog.count({
        where: { action: "REFRESH_REUSE_DETECTED", actorUserId: reuseUser.id },
      }),
    ).toBeGreaterThan(0);
  }, 60_000);

  it("guard: every public table is audited or on the exemption list", async () => {
    // Explicit exemptions:
    // - auth_sessions: session noise; security events logged explicitly
    // - audit_log: would recurse
    // - _prisma_migrations: Prisma bookkeeping
    // - invoice_counters: singleton numbering row (locked FOR UPDATE); not a business entity
    const EXEMPT = new Set([
      "auth_sessions",
      "audit_log",
      "_prisma_migrations",
      "invoice_counters",
    ]);

    const tables = await ctx.db.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;

    const audited = await ctx.db.prisma.$queryRaw<{ relname: string }[]>`
      SELECT DISTINCT c.relname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgname LIKE 'trg_audit_%'
        AND t.tgname NOT LIKE 'trg_audit_log_reject_%'
    `;
    const auditedSet = new Set(audited.map((r) => r.relname));

    for (const { tablename } of tables) {
      if (EXEMPT.has(tablename)) continue;
      expect(auditedSet.has(tablename), `${tablename} must be audited or exempt`).toBe(true);
    }
    for (const name of EXEMPT) {
      if (name === "_prisma_migrations") continue;
      expect(auditedSet.has(name), `${name} must remain exempt from row audit`).toBe(false);
    }
  });

  it("@Can: ADMIN gets 200 on /api/audit-log; OFFICE and FIELD get 403", async () => {
    await createUser("admin-can@example.com", Role.ADMIN);
    await createUser("office-can@example.com", Role.OFFICE);
    await createUser("field-can@example.com", Role.FIELD);

    const adminCookies = await loginCookies("admin-can@example.com");
    const officeCookies = await loginCookies("office-can@example.com");
    const fieldCookies = await loginCookies("field-can@example.com");

    const admin = await ctx.inject({
      method: "GET",
      url: "/api/audit-log",
      headers: { cookie: cookieHeader(adminCookies) },
    });
    expect(admin.statusCode).toBe(200);

    const office = await ctx.inject({
      method: "GET",
      url: "/api/audit-log",
      headers: { cookie: cookieHeader(officeCookies) },
    });
    expect(office.statusCode).toBe(403);
    expect(office.json().code).toBe(ErrorCode.FORBIDDEN);

    const field = await ctx.inject({
      method: "GET",
      url: "/api/audit-log",
      headers: { cookie: cookieHeader(fieldCookies) },
    });
    expect(field.statusCode).toBe(403);
  });
});
