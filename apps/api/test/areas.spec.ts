import { createId, ErrorCode, Role } from "@ddcrm/shared";
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

async function createDbUser(
  ctx: AuthTestContext,
  email: string,
  role: Role,
  areaIds: string[] = [],
) {
  const id = createId();
  await ctx.db.prisma.user.create({
    data: {
      id,
      email,
      name: email.split("@")[0]!,
      role,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      userAreas:
        areaIds.length > 0
          ? {
              create: areaIds.map((areaId) => ({
                id: createId(),
                areaId,
              })),
            }
          : undefined,
    },
  });
  const login = await ctx.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email, password },
  });
  expect(login.statusCode).toBe(200);
  return {
    id,
    cookies: parseCookies(getSetCookie(login)),
  };
}

async function adminCookies(ctx: AuthTestContext) {
  return createDbUser(ctx, "areas-admin@example.com", Role.ADMIN);
}

describe("areas", () => {
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

  it("ADMIN sees all including inactive; OFFICE all active; FIELD only assigned active", async () => {
    const admin = await adminCookies(ctx);
    const activeA = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "North District" },
    });
    expect(activeA.statusCode).toBe(201);
    const activeB = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "South District" },
    });
    expect(activeB.statusCode).toBe(201);
    const inactive = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "Closed District" },
    });
    const inactiveId = inactive.json().id as string;
    await ctx.inject({
      method: "PATCH",
      url: `/api/areas/${inactiveId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: false },
    });

    const assignedId = activeA.json().id as string;
    const field = await createDbUser(ctx, "field-areas@example.com", Role.FIELD, [assignedId]);
    const office = await createDbUser(ctx, "office-areas@example.com", Role.OFFICE);

    const adminList = await ctx.inject({
      method: "GET",
      url: "/api/areas",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json().total).toBe(3);

    const officeList = await ctx.inject({
      method: "GET",
      url: "/api/areas",
      headers: { cookie: cookieHeader(office.cookies) },
    });
    expect(officeList.statusCode).toBe(200);
    expect(officeList.json().total).toBe(2);
    expect(officeList.json().items.every((a: { isActive: boolean }) => a.isActive)).toBe(true);

    const fieldList = await ctx.inject({
      method: "GET",
      url: "/api/areas",
      headers: { cookie: cookieHeader(field.cookies) },
    });
    expect(fieldList.statusCode).toBe(200);
    expect(fieldList.json().total).toBe(1);
    expect(fieldList.json().items[0].id).toBe(assignedId);
  });

  it("FIELD GET other area by id → 404", async () => {
    const admin = await adminCookies(ctx);
    const a1 = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "Mine Only" },
    });
    const a2 = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "Not Mine" },
    });
    const field = await createDbUser(ctx, "field-one@example.com", Role.FIELD, [
      a1.json().id as string,
    ]);

    const other = await ctx.inject({
      method: "GET",
      url: `/api/areas/${a2.json().id}`,
      headers: { cookie: cookieHeader(field.cookies) },
    });
    expect(other.statusCode).toBe(404);
    expect(other.json().code).toBe(ErrorCode.NOT_FOUND);
  });

  it("deactivating area removes it from FIELD view immediately", async () => {
    const admin = await adminCookies(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "Field Zone" },
    });
    const areaId = created.json().id as string;
    const field = await createDbUser(ctx, "field-zone@example.com", Role.FIELD, [areaId]);

    let list = await ctx.inject({
      method: "GET",
      url: "/api/areas",
      headers: { cookie: cookieHeader(field.cookies) },
    });
    expect(list.json().total).toBe(1);

    await ctx.inject({
      method: "PATCH",
      url: `/api/areas/${areaId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: false },
    });

    list = await ctx.inject({
      method: "GET",
      url: "/api/areas",
      headers: { cookie: cookieHeader(field.cookies) },
    });
    expect(list.json().total).toBe(0);
  });

  it("duplicate name (Cyrillic, different case) → 409 on create", async () => {
    const admin = await adminCookies(ctx);
    const first = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "Москва" },
    });
    expect(first.statusCode).toBe(201);

    const dup = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "москва" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe(ErrorCode.CONFLICT);
  });

  it("create, update, list and search (ADMIN)", async () => {
    const admin = await adminCookies(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/areas",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "  East   Wing  " },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe("East Wing");

    const id = created.json().id as string;
    const updated = await ctx.inject({
      method: "PATCH",
      url: `/api/areas/${id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "East Wing Renamed" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("East Wing Renamed");

    const list = await ctx.inject({
      method: "GET",
      url: "/api/areas?search=renamed",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((a: { id: string }) => a.id === id)).toBe(true);
  });
});