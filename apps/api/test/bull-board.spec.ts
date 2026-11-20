import { createId, ErrorCode, QUEUE_NAMES, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BULL_BOARD_BASE_PATH } from "../src/bull-board/register-bull-board";
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

async function seedUser(
  ctx: AuthTestContext,
  email: string,
  role: Role,
): Promise<Record<string, string>> {
  await ctx.db.prisma.user.create({
    data: {
      id: createId(),
      email,
      name: email.split("@")[0]!,
      role,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    },
  });
  const login = await ctx.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email, password },
  });
  expect(login.statusCode).toBe(200);
  return parseCookies(getSetCookie(login));
}

describe("Bull Board (/api/admin/queues)", () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    ctx = await startAuthTestApp({ enableBullBoard: true });
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
  });

  it("no cookie → 401", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: BULL_BOARD_BASE_PATH,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("OFFICE and FIELD → 403; ADMIN → 200", async () => {
    const office = await seedUser(ctx, "office-bb@example.com", Role.OFFICE);
    const field = await seedUser(ctx, "field-bb@example.com", Role.FIELD);
    const admin = await seedUser(ctx, "admin-bb@example.com", Role.ADMIN);

    const officeRes = await ctx.inject({
      method: "GET",
      url: BULL_BOARD_BASE_PATH,
      headers: { cookie: cookieHeader(office) },
    });
    expect(officeRes.statusCode).toBe(403);
    expect(officeRes.json().code).toBe(ErrorCode.FORBIDDEN);

    const fieldRes = await ctx.inject({
      method: "GET",
      url: BULL_BOARD_BASE_PATH,
      headers: { cookie: cookieHeader(field) },
    });
    expect(fieldRes.statusCode).toBe(403);

    const adminRes = await ctx.inject({
      method: "GET",
      url: BULL_BOARD_BASE_PATH,
      headers: { cookie: cookieHeader(admin) },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  it("cross-origin mutating request → 403", async () => {
    const admin = await seedUser(ctx, "admin-bb2@example.com", Role.ADMIN);
    const res = await ctx.inject({
      method: "PUT",
      url: `${BULL_BOARD_BASE_PATH}/api/queues/${QUEUE_NAMES.DEFAULT}/pause`,
      headers: {
        cookie: cookieHeader(admin),
        origin: "https://evil.example",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe(ErrorCode.FORBIDDEN);
  });

  it("legacy /admin/queues path → 404", async () => {
    const res = await ctx.inject({
      method: "GET",
      url: "/admin/queues",
    });
    expect(res.statusCode).toBe(404);
  });
});