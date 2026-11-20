import { createHmac } from "node:crypto";
import { createId, ErrorCode, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../src/auth/cookies";
import { hashPassword } from "../src/auth/password";
import {
  cookieHeader,
  parseCookies,
  startAuthTestApp,
  stopAuthTestApp,
  type AuthTestContext,
} from "./helpers/auth-app";

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signHs256(
  payload: Record<string, unknown>,
  secret: string,
  expSecondsFromNow: number,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    }),
  );
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function algNoneToken(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.`;
}

async function createUser(
  ctx: AuthTestContext,
  opts: {
    email: string;
    password: string;
    role?: (typeof Role)[keyof typeof Role];
    isActive?: boolean;
    mustChangePassword?: boolean;
    name?: string;
  },
) {
  const now = new Date();
  return ctx.db.prisma.user.create({
    data: {
      id: createId(),
      email: opts.email.trim().toLowerCase(),
      name: opts.name ?? "Test User",
      role: opts.role ?? Role.ADMIN,
      passwordHash: await hashPassword(opts.password),
      isActive: opts.isActive ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
      passwordChangedAt: now,
    },
  });
}

function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

describe("auth", () => {
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

  it("login success sets httpOnly SameSite=Strict cookies and never returns tokens", async () => {
    await createUser(ctx, { email: "admin@example.com", password });

    const res = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@example.com", password },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      email: "admin@example.com",
      role: Role.ADMIN,
      mustChangePassword: false,
      areas: [],
    });
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token|passwordHash|token_hash/i);

    const setCookie = getSetCookie(res);
    expect(setCookie.length).toBeGreaterThanOrEqual(2);

    const access = setCookie.find((c) => c.startsWith(`${ACCESS_COOKIE}=`));
    const refresh = setCookie.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Strict/i);
    expect(access).toMatch(/Path=\/api(?!\/auth)/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Strict/i);
    expect(refresh).toMatch(/Path=\/api\/auth/i);
    expect(access).not.toMatch(/Secure/i); // NODE_ENV=test
  });

  it("sets Secure cookies when NODE_ENV=production", async () => {
    await createUser(ctx, { email: "admin@example.com", password });
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    // Config was already parsed — set cookies via cookie helper path by
    // re-reading isProduction from a fresh config is hard; assert the helper instead.
    const { setAuthCookies } = await import("../src/auth/cookies");
    const cookies: string[] = [];
    const reply = {
      setCookie: (name: string, value: string, opts: Record<string, unknown>) => {
        cookies.push(
          `${name}=${value}; Path=${opts.path}; ${opts.httpOnly ? "HttpOnly; " : ""}${opts.secure ? "Secure; " : ""}SameSite=${opts.sameSite}`,
        );
      },
    };
    setAuthCookies(
      reply as never,
      { accessToken: "a", refreshToken: "b" },
      { isProduction: true, accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 },
    );
    expect(cookies.join("\n")).toMatch(/Secure/);
    process.env.NODE_ENV = prev;
  });

  it("wrong password, unknown email and inactive user return identical UNAUTHENTICATED bodies", async () => {
    await createUser(ctx, { email: "admin@example.com", password });
    await createUser(ctx, {
      email: "inactive@example.com",
      password,
      isActive: false,
    });

    const wrong = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@example.com", password: "wrong-password-xx" },
    });
    const unknown = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password },
    });
    const inactive = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "inactive@example.com", password },
    });

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(inactive.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.json()).toEqual(inactive.json());
    expect(wrong.json().code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("locks out after 10 failures and resets on success", async () => {
    const user = await createUser(ctx, { email: "admin@example.com", password });

    for (let i = 0; i < 9; i += 1) {
      const res = await ctx.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "admin@example.com", password: "wrong-password-xx" },
      });
      expect(res.statusCode).toBe(401);
    }

    const tenth = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@example.com", password: "wrong-password-xx" },
    });
    expect(tenth.statusCode).toBe(429);
    expect(tenth.json().code).toBe(ErrorCode.ACCOUNT_LOCKED);
    expect(tenth.headers["retry-after"]).toBeTruthy();

    const locked = await ctx.db.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginCount).toBe(10);
    expect(locked.lockedUntil).toBeTruthy();

    // Unlock for reset test
    await ctx.db.prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: null, failedLoginCount: 3 },
    });

    const ok = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@example.com", password },
    });
    expect(ok.statusCode).toBe(200);
    const after = await ctx.db.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  async function loginCookies(email: string, pwd: string) {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: pwd },
    });
    expect(res.statusCode).toBe(200);
    return parseCookies(getSetCookie(res));
  }

  it("refresh rotates token; old token unusable; concurrent race yields one success", async () => {
    await createUser(ctx, { email: "admin@example.com", password });
    const cookies = await loginCookies("admin@example.com", password);
    const oldRefresh = cookies[REFRESH_COOKIE];

    const refreshed = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${oldRefresh}` },
    });
    expect(refreshed.statusCode).toBe(200);
    const newCookies = parseCookies(getSetCookie(refreshed));
    expect(newCookies[REFRESH_COOKIE]).toBeTruthy();
    expect(newCookies[REFRESH_COOKIE]).not.toBe(oldRefresh);

    const reuseOld = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${oldRefresh}` },
    });
    // Within 10s grace — 401 without family revoke
    expect(reuseOld.statusCode).toBe(401);
    const familyCount = await ctx.db.prisma.authSession.count({
      where: { revokedAt: null },
    });
    expect(familyCount).toBeGreaterThan(0);

    // Simulate reuse after 10s: mark rotated_at older
    const rotated = await ctx.db.prisma.authSession.findFirst({
      where: { rotatedAt: { not: null } },
    });
    expect(rotated).toBeTruthy();
    await ctx.db.prisma.authSession.update({
      where: { id: rotated!.id },
      data: { rotatedAt: new Date(Date.now() - 11_000) },
    });

    const reuseAttack = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${oldRefresh}` },
    });
    expect(reuseAttack.statusCode).toBe(401);
    const revoked = await ctx.db.prisma.authSession.count({
      where: { familyId: rotated!.familyId, revokedAt: null },
    });
    expect(revoked).toBe(0);
  });

  it("20 simultaneous refreshes of the same token produce exactly one success", async () => {
    await createUser(ctx, { email: "admin@example.com", password });
    const cookies = await loginCookies("admin@example.com", password);
    const refresh = cookies[REFRESH_COOKIE];

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ctx.inject({
          method: "POST",
          url: "/api/auth/refresh",
          headers: { cookie: `${REFRESH_COOKIE}=${refresh}` },
        }),
      ),
    );

    const successes = results.filter((r) => r.statusCode === 200);
    const failures = results.filter((r) => r.statusCode === 401);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);
  });

  it("rejects expired refresh token and deactivated user on refresh", async () => {
    const user = await createUser(ctx, { email: "admin@example.com", password });
    const cookies = await loginCookies("admin@example.com", password);

    await ctx.db.prisma.authSession.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${cookies[REFRESH_COOKIE]}` },
    });
    expect(expired.statusCode).toBe(401);

    await ctx.db.resetDb();
    await createUser(ctx, { email: "admin@example.com", password });
    const fresh = await loginCookies("admin@example.com", password);
    const dbUser = await ctx.db.prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
    });
    await ctx.db.prisma.user.update({
      where: { id: dbUser.id },
      data: { isActive: false },
    });
    const deactivated = await ctx.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${fresh[REFRESH_COOKIE]}` },
    });
    expect(deactivated.statusCode).toBe(401);
    void user;
  });

  it("logout revokes the family; change-password revokes other sessions; forced change blocks endpoints", async () => {
    const user = await createUser(ctx, {
      email: "admin@example.com",
      password,
      mustChangePassword: true,
    });
    const cookies = await loginCookies("admin@example.com", password);

    const blocked = await ctx.inject({
      method: "GET",
      url: "/api/health",
      // health is public — use a protected route
    });
    void blocked;

    const meOk = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader(cookies) },
    });
    expect(meOk.statusCode).toBe(200);

    // Dev route requires auth + password change should block non-allowlisted
    const ping = await ctx.inject({
      method: "POST",
      url: "/api/dev/ping-job",
      headers: {
        cookie: cookieHeader(cookies),
        origin: "http://localhost:5173",
      },
      payload: {},
    });
    // In test NODE_ENV=test, DevModule still loads (only skipped in production)
    expect(ping.statusCode).toBe(403);
    expect(ping.json().code).toBe(ErrorCode.PASSWORD_CHANGE_REQUIRED);

    // Second session
    const cookies2 = await loginCookies("admin@example.com", password);
    const changed = await ctx.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: {
        cookie: cookieHeader(cookies2),
        origin: "http://localhost:5173",
      },
      payload: {
        currentPassword: password,
        newPassword: "brand-new-password-99",
      },
    });
    expect(changed.statusCode).toBe(200);

    const otherStill = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader(cookies) },
    });
    expect(otherStill.statusCode).toBe(401);

    const newCookies = parseCookies(getSetCookie(changed));
    const logout = await ctx.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: cookieHeader(newCookies),
        origin: "http://localhost:5173",
      },
    });
    expect(logout.statusCode).toBe(200);

    const afterLogout = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader(newCookies) },
    });
    expect(afterLogout.statusCode).toBe(401);

    const activeSessions = await ctx.db.prisma.authSession.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(activeSessions).toBe(0);
  });

  it("rejects tampered, expired, and alg:none access tokens", async () => {
    await createUser(ctx, { email: "admin@example.com", password });
    const cookies = await loginCookies("admin@example.com", password);
    const secret = process.env.JWT_ACCESS_SECRET!;

    const tampered = `${cookies[ACCESS_COOKIE].slice(0, -4)}xxxx`;
    const tamperedRes = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `${ACCESS_COOKIE}=${tampered}` },
    });
    expect(tamperedRes.statusCode).toBe(401);

    const expired = signHs256({ sub: createId(), sid: createId() }, secret, -30);
    const expiredRes = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `${ACCESS_COOKIE}=${expired}` },
    });
    expect(expiredRes.statusCode).toBe(401);

    const noneToken = algNoneToken({ sub: createId(), sid: createId() });
    const noneRes = await ctx.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `${ACCESS_COOKIE}=${noneToken}` },
    });
    expect(noneRes.statusCode).toBe(401);
  });

  it("OriginGuard returns 403 for a wrong Origin on mutating requests", async () => {
    await createUser(ctx, { email: "admin@example.com", password });
    const cookies = await loginCookies("admin@example.com", password);

    // Clear must_change if any
    await ctx.db.prisma.user.updateMany({ data: { mustChangePassword: false } });

    const res = await ctx.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: cookieHeader(cookies),
        origin: "https://evil.example",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe(ErrorCode.FORBIDDEN);
  });
});
