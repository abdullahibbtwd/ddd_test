import { createId, Role } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

describe("actor isolation over HTTP (concurrent change-password)", () => {
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

  it("10 concurrent change-password calls each attribute PASSWORD_CHANGED to the right actor", async () => {
    const users: { id: string; email: string; cookies: Record<string, string> }[] = [];

    for (let i = 0; i < 10; i += 1) {
      const email = `iso-${i}@example.com`;
      const row = await ctx.db.prisma.user.create({
        data: {
          id: createId(),
          email,
          name: `Iso ${i}`,
          role: Role.FIELD,
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
      users.push({
        id: row.id,
        email,
        cookies: parseCookies(getSetCookie(login)),
      });
    }

    const results = await Promise.all(
      users.map((u, i) =>
        ctx.inject({
          method: "POST",
          url: "/api/auth/change-password",
          headers: {
            origin: "http://localhost:5173",
            cookie: cookieHeader(u.cookies),
          },
          payload: {
            currentPassword: password,
            newPassword: `iso-user-${i}-new-pass!`,
          },
        }),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    const auditRows = await ctx.db.prisma.auditLog.findMany({
      where: { action: "PASSWORD_CHANGED" },
      orderBy: { occurredAt: "asc" },
    });
    expect(auditRows).toHaveLength(10);

    const byActor = new Map(auditRows.map((r) => [r.actorUserId, r]));
    for (const u of users) {
      const row = byActor.get(u.id);
      expect(row, `missing PASSWORD_CHANGED for ${u.email}`).toBeTruthy();
      expect(row!.actorUserId).toBe(u.id);
      expect(row!.source).toBe("api");
    }
  });
});