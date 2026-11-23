import {
  ClientKind,
  createId,
  ErrorCode,
  Role,
  SiteStatus,
} from "@ddcrm/shared";
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
const EIK = "175074752";
const EIK2 = "831641791";

function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

async function login(
  ctx: AuthTestContext,
  email: string,
): Promise<Record<string, string>> {
  const res = await ctx.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return parseCookies(getSetCookie(res));
}

describe("sites", () => {
  let ctx: AuthTestContext;
  let areaA: string;
  let areaB: string;
  let areaC: string;
  let siteTypeId: string;
  let adminCookies: Record<string, string>;
  let officeCookies: Record<string, string>;
  let fieldCookies: Record<string, string>;
  let field2Cookies: Record<string, string>;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();

    areaA = createId();
    areaB = createId();
    areaC = createId();
    await ctx.db.prisma.area.createMany({
      data: [
        { id: areaA, name: "Център", isActive: true },
        { id: areaB, name: "Изток", isActive: true },
        { id: areaC, name: "Запад", isActive: true },
      ],
    });

    const types = await ctx.db.prisma.siteType.findMany({ take: 1 });
    if (types[0]) {
      siteTypeId = types[0].id;
    } else {
      siteTypeId = createId();
      await ctx.db.prisma.siteType.create({
        data: { id: siteTypeId, name: "Ресторант", isActive: true },
      });
    }

    async function user(email: string, role: Role, areas: string[]) {
      const id = createId();
      await ctx.db.prisma.user.create({
        data: {
          id,
          email,
          name: email,
          role,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
          mustChangePassword: false,
        },
      });
      for (const areaId of areas) {
        await ctx.db.prisma.userArea.create({
          data: { id: createId(), userId: id, areaId },
        });
      }
      return login(ctx, email);
    }

    adminCookies = await user("sites-admin@example.com", Role.ADMIN, []);
    officeCookies = await user("sites-office@example.com", Role.OFFICE, []);
    fieldCookies = await user("sites-field@example.com", Role.FIELD, [areaA, areaB]);
    field2Cookies = await user("sites-field2@example.com", Role.FIELD, [areaC]);
  });

  async function createClient(
    cookies: Record<string, string>,
    name: string,
    eik: string,
  ): Promise<string> {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(cookies) },
      payload: { kind: ClientKind.COMPANY, name, eik },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it("DB constraints: coords pair, ranges, points, floor area, status/terminated_at", async () => {
    const clientId = await createClient(adminCookies, "Constraint Co", EIK);
    const base = {
      id: createId(),
      clientId,
      areaId: areaA,
      siteTypeId,
      name: "X",
      address: "ул. 1",
    };

    await expect(
      ctx.db.prisma.site.create({
        data: { ...base, latitude: 42, longitude: null },
      }),
    ).rejects.toThrow();

    await expect(
      ctx.db.prisma.site.create({
        data: { ...base, id: createId(), latitude: 91, longitude: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      ctx.db.prisma.site.create({
        data: { ...base, id: createId(), monitoringPointsCount: -1 },
      }),
    ).rejects.toThrow();

    await expect(
      ctx.db.prisma.site.create({
        data: { ...base, id: createId(), floorAreaM2: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      ctx.db.prisma.site.create({
        data: {
          ...base,
          id: createId(),
          status: SiteStatus.TERMINATED,
          terminatedAt: null,
        },
      }),
    ).rejects.toThrow();
  });

  it("FIELD scoping: list/map/get; create out-of-scope 403; PATCH 403", async () => {
    const clientId = await createClient(adminCookies, "Scope Client", EIK);
    const inScope = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        areaId: areaA,
        siteTypeId,
        name: "In scope",
        address: "ул. А 1",
        latitude: 42.7,
        longitude: 23.3,
      },
    });
    expect(inScope.statusCode).toBe(201);
    const outScope = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        areaId: areaC,
        siteTypeId,
        name: "Out scope",
        address: "ул. В 1",
        latitude: 43.2,
        longitude: 27.9,
      },
    });
    expect(outScope.statusCode).toBe(201);

    const list = await ctx.inject({
      method: "GET",
      url: "/api/sites",
      headers: { cookie: cookieHeader(fieldCookies) },
    });
    expect(list.statusCode).toBe(200);
    const ids = (list.json().items as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(inScope.json().id);
    expect(ids).not.toContain(outScope.json().id);

    const getOut = await ctx.inject({
      method: "GET",
      url: `/api/sites/${outScope.json().id}`,
      headers: { cookie: cookieHeader(fieldCookies) },
    });
    expect(getOut.statusCode).toBe(404);

    const createOut = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        clientId,
        areaId: areaC,
        siteTypeId,
        name: "Field blocked",
        address: "ул. X",
      },
    });
    expect(createOut.statusCode).toBe(403);

    const patch = await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${inScope.json().id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: { name: "Nope" },
    });
    expect(patch.statusCode).toBe(403);

    // Client with only area-C sites is visible to field2, not to a fresh FIELD with no overlap.
    const field2Sees = await ctx.inject({
      method: "GET",
      url: `/api/clients/${clientId}`,
      headers: { cookie: cookieHeader(field2Cookies) },
    });
    expect(field2Sees.statusCode).toBe(200);

    // New client with only area-A site stays invisible to field2 until OFFICE adds area-C site.
    const otherClient = await createClient(adminCookies, "Later Visible", "121031861");
    await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId: otherClient,
        areaId: areaA,
        siteTypeId,
        name: "Only A",
        address: "ул. A only",
      },
    });
    const before = await ctx.inject({
      method: "GET",
      url: `/api/clients/${otherClient}`,
      headers: { cookie: cookieHeader(field2Cookies) },
    });
    expect(before.statusCode).toBe(404);

    await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId: otherClient,
        areaId: areaC,
        siteTypeId,
        name: "Now C",
        address: "ул. C now",
      },
    });
    const after = await ctx.inject({
      method: "GET",
      url: `/api/clients/${otherClient}`,
      headers: { cookie: cookieHeader(field2Cookies) },
    });
    expect(after.statusCode).toBe(200);
  });

  it("quick-add: creates client+site; rollback when site fails; DUPLICATE_EIK details scoped", async () => {
    // Seed an out-of-scope client with EIK for no-details case
    const otherClient = await createClient(adminCookies, "Hidden Co", EIK2);
    await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId: otherClient,
        areaId: areaC,
        siteTypeId,
        name: "Hidden site",
        address: "hidden",
      },
    });

    const ok = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        areaId: areaA,
        siteTypeId,
        name: "Quick site",
        address: "ул. Quick 1",
        newClient: {
          kind: ClientKind.COMPANY,
          name: "Quick Client ООД",
          eik: EIK,
        },
      },
    });
    expect(ok.statusCode).toBe(201);

    const audit = await ctx.db.prisma.auditLog.findMany({
      where: { actorUserId: { not: null } },
      orderBy: { occurredAt: "desc" },
      take: 10,
    });
    const entityTypes = new Set(audit.map((a) => a.entityType));
    expect(entityTypes.has("clients")).toBe(true);
    expect(entityTypes.has("sites")).toBe(true);

    // Duplicate EIK out of scope → no details
    const dupOut = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        areaId: areaA,
        siteTypeId,
        name: "Dup out",
        address: "ул. Dup",
        newClient: { kind: ClientKind.COMPANY, name: "X", eik: EIK2 },
      },
    });
    expect(dupOut.statusCode).toBe(409);
    expect(dupOut.json().code).toBe(ErrorCode.DUPLICATE_EIK);
    expect(dupOut.json().details).toBeUndefined();

    // Rollback: invalid site type id after client would be created — use inactive type
    const inactiveType = createId();
    await ctx.db.prisma.siteType.create({
      data: { id: inactiveType, name: "Неактивен вид XYZ", isActive: false },
    });
    const beforeClients = await ctx.db.prisma.client.count();
    const fail = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(fieldCookies) },
      payload: {
        areaId: areaA,
        siteTypeId: inactiveType,
        name: "Should fail",
        address: "ул. Fail",
        newClient: {
          kind: ClientKind.COMPANY,
          name: "Rollback Client",
          eik: "121031861",
        },
      },
    });
    expect(fail.statusCode).toBe(400);
    expect(await ctx.db.prisma.client.count()).toBe(beforeClients);
  });

  it("archive blocked with active sites; terminate then archive; archived client blocks site", async () => {
    const clientId = await createClient(adminCookies, "Archive Co", EIK);
    const site = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        areaId: areaA,
        siteTypeId,
        name: "Active site",
        address: "ул. 1",
      },
    });
    const siteId = site.json().id as string;

    const archiveFail = await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${clientId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminCookies) },
      payload: { isActive: false },
    });
    expect(archiveFail.statusCode).toBe(409);
    expect(archiveFail.json().code).toBe(ErrorCode.CLIENT_HAS_ACTIVE_SITES);

    await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${siteId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { status: SiteStatus.TERMINATED },
    });

    const archiveOk = await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${clientId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminCookies) },
      payload: { isActive: false },
    });
    expect(archiveOk.statusCode).toBe(200);

    const createOnArchived = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        areaId: areaA,
        siteTypeId,
        name: "Blocked",
        address: "ул. 2",
      },
    });
    expect(createOnArchived.statusCode).toBe(409);
    expect(createOnArchived.json().code).toBe(ErrorCode.CLIENT_ARCHIVED);

    const reactivate = await ctx.inject({
      method: "PATCH",
      url: `/api/sites/${siteId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: { status: SiteStatus.ACTIVE },
    });
    expect(reactivate.statusCode).toBe(409);
    expect(reactivate.json().code).toBe(ErrorCode.CLIENT_ARCHIVED);
  });

  it("map endpoint caps at 500 with truncated flag", async () => {
    const clientId = await createClient(adminCookies, "Map Co", EIK);
    await ctx.db.prisma.site.createMany({
      data: Array.from({ length: 501 }, (_, i) => ({
        id: createId(),
        clientId,
        areaId: areaA,
        siteTypeId,
        name: `Map ${String(i).padStart(3, "0")}`,
        address: `addr ${i}`,
        latitude: 42.7 + (i % 50) * 0.01,
        longitude: 23.3 + Math.floor(i / 50) * 0.01,
        status: SiteStatus.ACTIVE,
      })),
    });
    await ctx.db.prisma.site.create({
      data: {
        id: createId(),
        clientId,
        areaId: areaA,
        siteTypeId,
        name: "No coords",
        address: "none",
        status: SiteStatus.ACTIVE,
      },
    });

    const map = await ctx.inject({
      method: "GET",
      url: "/api/sites/map",
      headers: { cookie: cookieHeader(adminCookies) },
    });
    expect(map.statusCode).toBe(200);
    expect(map.json().items).toHaveLength(500);
    expect(map.json().total).toBe(501);
    expect(map.json().truncated).toBe(true);
  });

  it("20 simultaneous quick-adds with the same EIK give exactly one success", async () => {
    const eik = "131134023";
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        ctx.inject({
          method: "POST",
          url: "/api/sites",
          headers: {
            origin: "http://localhost:5173",
            cookie: cookieHeader(fieldCookies),
          },
          payload: {
            areaId: areaA,
            siteTypeId,
            name: `Race site ${i}`,
            address: `ул. Race ${i}`,
            newClient: {
              kind: ClientKind.COMPANY,
              name: `Race Quick ${i}`,
              eik,
            },
          },
        }),
      ),
    );
    const ok = results.filter((r) => r.statusCode === 201);
    const dup = results.filter((r) => r.statusCode === 409);
    expect(ok).toHaveLength(1);
    expect(dup).toHaveLength(19);
    for (const res of dup) {
      expect(res.json().code).toBe(ErrorCode.DUPLICATE_EIK);
    }
    expect(await ctx.db.prisma.client.count({ where: { eik } })).toBe(1);
  });

  it("site types: Cyrillic case-insensitive unique; inactive rejected for new sites", async () => {
    const create = await ctx.inject({
      method: "POST",
      url: "/api/site-types",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminCookies) },
      payload: { name: "Тестов вид" },
    });
    expect(create.statusCode).toBe(201);

    const dup = await ctx.inject({
      method: "POST",
      url: "/api/site-types",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminCookies) },
      payload: { name: "тестов ВИД" },
    });
    expect(dup.statusCode).toBe(409);

    const typeId = create.json().id as string;
    await ctx.inject({
      method: "PATCH",
      url: `/api/site-types/${typeId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(adminCookies) },
      payload: { isActive: false },
    });

    const clientId = await createClient(adminCookies, "Type Co", EIK2);
    const site = await ctx.inject({
      method: "POST",
      url: "/api/sites",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(officeCookies) },
      payload: {
        clientId,
        areaId: areaA,
        siteTypeId: typeId,
        name: "Bad type",
        address: "ул. 1",
      },
    });
    expect(site.statusCode).toBe(400);
  });
});
