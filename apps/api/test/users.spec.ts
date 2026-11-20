import { createId, ErrorCode, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REFRESH_COOKIE } from "../src/auth/cookies";
import { hashPassword } from "../src/auth/password";
import {
  cookieHeader,
  parseCookies,
  startAuthTestApp,
  stopAuthTestApp,
  type AuthTestContext,
} from "./helpers/auth-app";

const password = "correct-horse-battery";

function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

async function createDbUser(
  ctx: AuthTestContext,
  opts: {
    email: string;
    role?: Role;
    password?: string;
    mustChangePassword?: boolean;
    isActive?: boolean;
  },
) {
  return ctx.db.prisma.user.create({
    data: {
      id: createId(),
      email: opts.email.trim().toLowerCase(),
      name: opts.email.split("@")[0]!,
      role: opts.role ?? Role.ADMIN,
      passwordHash: await hashPassword(opts.password ?? password),
      passwordChangedAt: new Date(),
      mustChangePassword: opts.mustChangePassword ?? false,
      isActive: opts.isActive ?? true,
    },
  });
}

async function loginCookies(ctx: AuthTestContext, email: string, pwd = password) {
  const res = await ctx.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email, password: pwd },
  });
  expect(res.statusCode).toBe(200);
  return parseCookies(getSetCookie(res));
}

async function adminSession(ctx: AuthTestContext) {
  await createDbUser(ctx, { email: "users-admin@example.com" });
  return loginCookies(ctx, "users-admin@example.com");
}

function auditSnapshotsGrep(rows: { before: unknown; after: unknown; meta: unknown }[]) {
  const text = JSON.stringify(rows);
  expect(text).not.toMatch(/temporaryPassword/i);
}

describe("users", () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
  });

  it("CRUD via admin API", async () => {
    const admin = await adminSession(ctx);

    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: {
        email: "new-user@example.com",
        name: "New User",
        role: Role.OFFICE,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().temporaryPassword).toBeTruthy();
    expect(created.json().areas).toEqual([]);
    const userId = created.json().id as string;
    const tempPwd = created.json().temporaryPassword as string;

    const getOne = await ctx.inject({
      method: "GET",
      url: `/api/users/${userId}`,
      headers: { cookie: cookieHeader(admin) },
    });
    expect(getOne.statusCode).toBe(200);
    expect(getOne.json().email).toBe("new-user@example.com");

    const updated = await ctx.inject({
      method: "PATCH",
      url: `/api/users/${userId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { name: "Renamed User" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Renamed User");

    const list = await ctx.inject({
      method: "GET",
      url: "/api/users?search=renamed",
      headers: { cookie: cookieHeader(admin) },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((u: { id: string }) => u.id === userId)).toBe(true);

    void tempPwd;
  });

  it("duplicate email (case-insensitive) → 409", async () => {
    const admin = await adminSession(ctx);
    const first = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { email: "Dupe@Example.com", name: "One", role: Role.FIELD },
    });
    expect(first.statusCode).toBe(201);

    const dup = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { email: "dupe@example.com", name: "Two", role: Role.FIELD },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe(ErrorCode.CONFLICT);
  });

  it("temporaryPassword returned once; never in audit snapshots", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { email: "temp-pwd@example.com", name: "Temp", role: Role.OFFICE },
    });
    const tempPwd = created.json().temporaryPassword as string;
    expect(tempPwd.length).toBeGreaterThanOrEqual(10);

    const userId = created.json().id as string;
    const reset = await ctx.inject({
      method: "POST",
      url: `/api/users/${userId}/reset-password`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().temporaryPassword).toBeTruthy();
    expect(reset.json().temporaryPassword).not.toBe(tempPwd);

    const rows = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "users", entityId: userId },
    });
    auditSnapshotsGrep(rows);
    const security = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "users", action: "PASSWORD_RESET_BY_ADMIN" },
    });
    auditSnapshotsGrep(security);
    expect(JSON.stringify(security)).not.toContain(reset.json().temporaryPassword);
  });

  it("deactivation revokes sessions and blocks login and refresh", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { email: "deact@example.com", name: "Deact", role: Role.OFFICE },
    });
    const userId = created.json().id as string;
    const tempPwd = created.json().temporaryPassword as string;
    const userCookies = await loginCookies(ctx, "deact@example.com", tempPwd);

    await ctx.inject({
      method: "PATCH",
      url: `/api/users/${userId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { isActive: false },
    });

    const activeSessions = await ctx.db.prisma.authSession.count({
      where: { userId, revokedAt: null },
    });
    expect(activeSessions).toBe(0);

    const loginFail = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "deact@example.com", password: tempPwd },
    });
    expect(loginFail.statusCode).toBe(401);

    const refreshFail = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        origin: "http://localhost:5173",
        cookie: `${REFRESH_COOKIE}=${userCookies[REFRESH_COOKIE]}`,
      },
    });
    expect(refreshFail.statusCode).toBe(401);
  });

  it("reset password sets mustChangePassword and revokes other sessions", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { email: "reset-me@example.com", name: "Reset", role: Role.OFFICE },
    });
    const userId = created.json().id as string;
    const temp1 = created.json().temporaryPassword as string;
    const cookies1 = await loginCookies(ctx, "reset-me@example.com", temp1);
    const cookies2 = await loginCookies(ctx, "reset-me@example.com", temp1);

    await ctx.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: {
        origin: "http://localhost:5173",
        cookie: cookieHeader(cookies2),
      },
      payload: { currentPassword: temp1, newPassword: "reset-me-own-pass!" },
    });

    const reset = await ctx.inject({
      method: "POST",
      url: `/api/users/${userId}/reset-password`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
    });
    const temp2 = reset.json().temporaryPassword as string;

    const dbUser = await ctx.db.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(dbUser.mustChangePassword).toBe(true);

    const meOld = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader(cookies1) },
    });
    expect(meOld.statusCode).toBe(401);

    const loginNew = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "reset-me@example.com", password: temp2 },
    });
    expect(loginNew.statusCode).toBe(200);
    expect(loginNew.json().user.mustChangePassword).toBe(true);
    expect(loginNew.json().user.areas).toEqual([]);
  });

  it("user can login with temp password and must change before protected routes", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { email: "must-change@example.com", name: "Must", role: Role.FIELD },
    });
    const tempPwd = created.json().temporaryPassword as string;
    const cookies = await loginCookies(ctx, "must-change@example.com", tempPwd);

    const blocked = await ctx.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: cookieHeader(cookies) },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe(ErrorCode.PASSWORD_CHANGE_REQUIRED);

    const me = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader(cookies) },
    });
    expect(me.statusCode).toBe(200);
  });

  it("self role change or self-deactivate → 409 SELF_MODIFICATION_FORBIDDEN", async () => {
    const admin = await adminSession(ctx);
    const me = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader(admin) },
    });
    const adminId = me.json().user.id as string;

    const demoteSelf = await ctx.inject({
      method: "PATCH",
      url: `/api/users/${adminId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { role: Role.OFFICE },
    });
    expect(demoteSelf.statusCode).toBe(409);
    expect(demoteSelf.json().code).toBe(ErrorCode.SELF_MODIFICATION_FORBIDDEN);

    const deactivateSelf = await ctx.inject({
      method: "PATCH",
      url: `/api/users/${adminId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { isActive: false },
    });
    expect(deactivateSelf.statusCode).toBe(409);
    expect(deactivateSelf.json().code).toBe(ErrorCode.SELF_MODIFICATION_FORBIDDEN);
  });

  it("last-admin race: two admins demote each other — one success, ≥1 active ADMIN", async () => {
    const adminA = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminA) },
      payload: { email: "admin-b-race@example.com", name: "Admin B", role: Role.ADMIN },
    });
    const idA = (
      await ctx.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: cookieHeader(adminA) },
      })
    ).json().user.id as string;
    const idB = created.json().id as string;
    const adminB = await loginCookies(ctx, "admin-b-race@example.com", created.json().temporaryPassword);
    await ctx.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminB) },
      payload: {
        currentPassword: created.json().temporaryPassword,
        newPassword: "admin-b-race-new-pass",
      },
    });
    const adminBFresh = await loginCookies(ctx, "admin-b-race@example.com", "admin-b-race-new-pass");

    const results = await Promise.all([
      ctx.inject({
        method: "PATCH",
        url: `/api/users/${idB}`,
        headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminA) },
        payload: { role: Role.OFFICE },
      }),
      ctx.inject({
        method: "PATCH",
        url: `/api/users/${idA}`,
        headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminBFresh) },
        payload: { role: Role.OFFICE },
      }),
    ]);

    const successes = results.filter((r) => r.statusCode === 200);
    const failures = results.filter((r) => r.statusCode === 409);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.json().code).toBe(ErrorCode.LAST_ADMIN_REQUIRED);

    const activeAdmins = await ctx.db.prisma.user.count({
      where: { role: Role.ADMIN, isActive: true },
    });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  it("areaIds replace on update; FIELD→OFFICE keeps user_areas rows", async () => {
    const admin = await adminSession(ctx);
    const a1 = await ctx.db.prisma.area.create({
      data: { id: createId(), name: "Area One", isActive: true },
    });
    const a2 = await ctx.db.prisma.area.create({
      data: { id: createId(), name: "Area Two", isActive: true },
    });

    const created = await ctx.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: {
        email: "field-areas@example.com",
        name: "Field Areas",
        role: Role.FIELD,
        areaIds: [a1.id, a2.id],
      },
    });
    const userId = created.json().id as string;
    expect(created.json().areas.map((a: { id: string }) => a.id).sort()).toEqual(
      [a1.id, a2.id].sort(),
    );

    const replaced = await ctx.inject({
      method: "PATCH",
      url: `/api/users/${userId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { areaIds: [a1.id] },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().areas).toHaveLength(1);

    const promoted = await ctx.inject({
      method: "PATCH",
      url: `/api/users/${userId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin) },
      payload: { role: Role.OFFICE },
    });
    expect(promoted.statusCode).toBe(200);

    const linkCount = await ctx.db.prisma.userArea.count({ where: { userId } });
    expect(linkCount).toBe(1);

    const loginRes = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: {
        email: "field-areas@example.com",
        password: created.json().temporaryPassword,
      },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().user.areas).toHaveLength(1);
  });
});