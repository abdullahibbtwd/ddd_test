import { createId, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTH_SESSIONS_CLEANUP_JOB } from "../src/processors/default.processor";
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
import { deleteExpiredAuthSessions } from "../src/auth/cleanup-expired-sessions";

/**
 * Catches forgotten actor contexts: every production write path exercised here
 * must NOT leave audit rows with source=system and null actor.
 */
describe("actor context coverage (no forgotten system/null rows)", () => {
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

  function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
    const raw = res.headers["set-cookie"];
    if (!raw) return [];
    return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
  }

  it("login, failed login, change-password, refresh, cleanup job, create-admin leave no system/null actor rows", async () => {
    // Setup user via CLI context (same as create-admin) so the seed CREATE is not system/null.
    const prismaSetup = createAppPrisma(ctx.db.connectionString);
    try {
      await runWithActorContextAsync(
        {
          source: "cli",
          actorLabel: "cli:create-admin",
          actorUserId: null,
          requestId: null,
          ip: null,
        },
        async () => {
          await prismaSetup.user.create({
            data: {
              id: createId(),
              email: "paths@example.com",
              name: "Paths",
              role: Role.ADMIN,
              passwordHash: await hashPassword(password),
              passwordChangedAt: new Date(),
            },
          });
        },
      );
    } finally {
      await prismaSetup.$disconnect();
    }

    // Failed login (known + unknown)
    await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "paths@example.com", password: "wrong-password-xx" },
    });
    await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "nobody-paths@example.com", password },
    });

    // Login success
    const login = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "paths@example.com", password },
    });
    expect(login.statusCode).toBe(200);
    const cookies = parseCookies(getSetCookie(login));

    // Change password
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
    const cookies2 = parseCookies(getSetCookie(changed));

    // Refresh
    const refresh = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        origin: "http://localhost:5173",
        cookie: `refresh_token=${cookies2.refresh_token}`,
      },
    });
    expect(refresh.statusCode).toBe(200);

    // Session cleanup job (worker label)
    const prisma = createAppPrisma(ctx.db.connectionString);
    try {
      await runWithActorContextAsync(
        {
          source: "worker",
          actorLabel: `worker:default:${AUTH_SESSIONS_CLEANUP_JOB}`,
          actorUserId: null,
          requestId: "job-1",
          ip: null,
        },
        async () => {
          await deleteExpiredAuthSessions(prisma, 7);
        },
      );

      // create-admin style CLI write
      await runWithActorContextAsync(
        {
          source: "cli",
          actorLabel: "cli:create-admin",
          actorUserId: null,
          requestId: null,
          ip: null,
        },
        async () => {
          await prisma.user.create({
            data: {
              id: createId(),
              email: "cli-admin@example.com",
              name: "CLI Admin",
              role: Role.ADMIN,
              passwordHash: await hashPassword(password),
              passwordChangedAt: new Date(),
            },
          });
        },
      );
    } finally {
      await prisma.$disconnect();
    }

    const bad = await ctx.db.prisma.auditLog.findMany({
      where: { source: "system", actorUserId: null },
    });
    expect(
      bad,
      `unexpected system/null audit rows: ${JSON.stringify(bad.map((b) => ({ action: b.action, entityType: b.entityType })))}`,
    ).toEqual([]);
  });
});
