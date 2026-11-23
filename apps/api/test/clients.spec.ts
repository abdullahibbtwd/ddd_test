import {
  ClientKind,
  createId,
  DuplicateReason,
  ErrorCode,
  PaymentMethod,
  Role,
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

const EIK_VALID = {
  short: ["831641791", "131268894", "175074752", "121031861", "240000000"] as const,
  long: ["1312688940008", "8316417910002"] as const,
};

const EIK_INVALID = ["831641792", "131268895"] as const;

function getSetCookie(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

async function createDbUser(
  ctx: AuthTestContext,
  email: string,
  role: Role,
): Promise<{ id: string; cookies: Record<string, string> }> {
  const id = createId();
  await ctx.db.prisma.user.create({
    data: {
      id,
      email: email.trim().toLowerCase(),
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
  return {
    id,
    cookies: parseCookies(getSetCookie(login)),
  };
}

async function adminSession(ctx: AuthTestContext) {
  return createDbUser(ctx, "clients-admin@example.com", Role.ADMIN);
}

function expectInvalidEik(res: { statusCode: number; json: () => unknown }) {
  expect(res.statusCode).toBe(400);
  const body = res.json() as { code: string; details?: unknown };
  expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
  expect(JSON.stringify(body.details ?? body)).toContain(ErrorCode.INVALID_EIK);
}

describe("clients", () => {
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

  it("creates COMPANY and INDIVIDUAL", async () => {
    const admin = await adminSession(ctx);

    const company = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "  АКМЕ   ООД  ",
        eik: EIK_VALID.short[0],
        vatNumber: "bg831641791",
        preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
      },
    });
    expect(company.statusCode).toBe(201);
    expect(company.json().kind).toBe(ClientKind.COMPANY);
    expect(company.json().name).toBe("АКМЕ ООД");
    expect(company.json().eik).toBe(EIK_VALID.short[0]);
    expect(company.json().vatNumber).toBe("BG831641791");
    expect(company.json().isActive).toBe(true);

    const individual = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.INDIVIDUAL,
        name: "Иван Петров",
      },
    });
    expect(individual.statusCode).toBe(201);
    expect(individual.json().kind).toBe(ClientKind.INDIVIDUAL);
    expect(individual.json().eik).toBeNull();
    expect(individual.json().legalRepresentative).toBeNull();

    const individualWithEik = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.INDIVIDUAL,
        name: "Мария Георгиева",
        eik: EIK_VALID.long[0],
      },
    });
    expect(individualWithEik.statusCode).toBe(201);
    expect(individualWithEik.json().eik).toBe(EIK_VALID.long[0]);
  });

  it("COMPANY without EIK → 400 VALIDATION_FAILED", async () => {
    const admin = await adminSession(ctx);
    const res = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Без ЕИК ООД",
      },
    });
    expectInvalidEik(res);
  });

  it("invalid EIK checksum → VALIDATION_FAILED / INVALID_EIK", async () => {
    const admin = await adminSession(ctx);
    for (const eik of EIK_INVALID) {
      const res = await ctx.inject({
        method: "POST",
        url: "/api/clients",
        headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
        payload: {
          kind: ClientKind.COMPANY,
          name: `Invalid ${eik}`,
          eik,
        },
      });
      expectInvalidEik(res);
    }
  });

  it("duplicate EIK → 409 DUPLICATE_EIK with existing client details (incl. archived)", async () => {
    const admin = await adminSession(ctx);
    const first = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Първи ЕООД",
        eik: EIK_VALID.short[1],
      },
    });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().id as string;
    const firstName = first.json().name as string;

    const dup = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Втори ЕООД",
        eik: EIK_VALID.short[1],
      },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe(ErrorCode.DUPLICATE_EIK);
    expect(dup.json().details).toEqual({
      existingClientId: firstId,
      existingName: firstName,
      existingIsActive: true,
    });

    await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${firstId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: false },
    });

    const dupArchived = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Нов след архив",
        eik: EIK_VALID.short[1],
      },
    });
    expect(dupArchived.statusCode).toBe(409);
    expect(dupArchived.json().code).toBe(ErrorCode.DUPLICATE_EIK);
    expect(dupArchived.json().details).toEqual({
      existingClientId: firstId,
      existingName: firstName,
      existingIsActive: false,
    });
  });

  it("20 concurrent creates with same EIK → exactly one 201 and 19 DUPLICATE_EIK", async () => {
    const admin = await adminSession(ctx);
    const eik = EIK_VALID.short[2];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        ctx.inject({
          method: "POST",
          url: "/api/clients",
          headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
          payload: {
            kind: ClientKind.COMPANY,
            name: `Concurrent ${i}`,
            eik,
          },
        }),
      ),
    );

    const created = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    for (const res of conflicts) {
      expect(res.json().code).toBe(ErrorCode.DUPLICATE_EIK);
      expect(res.json().details).toMatchObject({
        existingClientId: created[0]!.json().id,
        existingIsActive: true,
      });
    }

    const count = await ctx.db.prisma.client.count({ where: { eik } });
    expect(count).toBe(1);
  });

  it("GET /api/clients/duplicates — similar Bulgarian names; excludeId; unrelated omitted", async () => {
    const admin = await adminSession(ctx);
    const rambo = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "РАМБО ЕООД",
        eik: EIK_VALID.short[0],
      },
    });
    const ramboId = rambo.json().id as string;

    const restaurant = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: 'Ресторант „Златната ябълка“',
        eik: EIK_VALID.short[3],
      },
    });
    const restaurantId = restaurant.json().id as string;

    await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Напълно Несвързано АД",
        eik: EIK_VALID.short[4],
      },
    });

    const ramboDupes = await ctx.inject({
      method: "GET",
      url: "/api/clients/duplicates?name=Рамбо",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(ramboDupes.statusCode).toBe(200);
    const ramboItems = ramboDupes.json().items as {
      id: string;
      reason: string;
    }[];
    expect(ramboItems.some((i) => i.id === ramboId && i.reason === DuplicateReason.SIMILAR_NAME)).toBe(
      true,
    );
    expect(ramboItems.every((i) => i.id !== restaurantId)).toBe(true);

    const restaurantDupes = await ctx.inject({
      method: "GET",
      url: `/api/clients/duplicates?name=${encodeURIComponent("ресторант златната ябълка")}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(restaurantDupes.statusCode).toBe(200);
    expect(
      (restaurantDupes.json().items as { id: string }[]).some((i) => i.id === restaurantId),
    ).toBe(true);

    const unrelated = await ctx.inject({
      method: "GET",
      url: `/api/clients/duplicates?name=${encodeURIComponent("Рамбо")}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    const unrelatedIds = (unrelated.json().items as { id: string; name: string }[]).map((i) => i.id);
    expect(unrelatedIds).toContain(ramboId);
    expect(unrelatedIds).not.toContain(restaurantId);

    const excluded = await ctx.inject({
      method: "GET",
      url: `/api/clients/duplicates?name=${encodeURIComponent("Рамбо")}&excludeId=${ramboId}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(excluded.statusCode).toBe(200);
    expect((excluded.json().items as { id: string }[]).every((i) => i.id !== ramboId)).toBe(true);

    const sameEik = await ctx.inject({
      method: "GET",
      url: `/api/clients/duplicates?eik=${EIK_VALID.short[0]}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(sameEik.statusCode).toBe(200);
    const eikHit = (sameEik.json().items as { id: string; reason: string }[])[0];
    expect(eikHit?.id).toBe(ramboId);
    expect(eikHit?.reason).toBe(DuplicateReason.SAME_EIK);
  });

  it("list search: Cyrillic case-insensitive name, EIK prefix, phone digits, email contains", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Фокус Трейд ООД",
        eik: EIK_VALID.long[1],
        phone: "0888 123 456",
        email: "Focus.Sales@Example.com",
      },
    });
    expect(created.statusCode).toBe(201);
    const clientId = created.json().id as string;

    const byName = await ctx.inject({
      method: "GET",
      url: `/api/clients?search=${encodeURIComponent("фокус")}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(byName.json().items.some((c: { id: string }) => c.id === clientId)).toBe(true);

    const byEik = await ctx.inject({
      method: "GET",
      url: `/api/clients?search=${encodeURIComponent("831641")}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(byEik.json().items.some((c: { id: string }) => c.id === clientId)).toBe(true);

    const byPhone = await ctx.inject({
      method: "GET",
      url: "/api/clients?search=888123",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(byPhone.json().items.some((c: { id: string }) => c.id === clientId)).toBe(true);

    const byEmail = await ctx.inject({
      method: "GET",
      url: "/api/clients?search=focus.sales",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(byEmail.json().items.some((c: { id: string }) => c.id === clientId)).toBe(true);
  });

  it("list filters kind and isActive; paginates; default hides archived", async () => {
    const admin = await adminSession(ctx);

    const activeCompany = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Active Co",
        eik: EIK_VALID.short[0],
      },
    });
    const activeIndividual = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { kind: ClientKind.INDIVIDUAL, name: "Active Person" },
    });
    const toArchive = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Archived Co",
        eik: EIK_VALID.short[1],
      },
    });
    await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${toArchive.json().id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: false },
    });

    const defaultList = await ctx.inject({
      method: "GET",
      url: "/api/clients?pageSize=50",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(defaultList.statusCode).toBe(200);
    expect(defaultList.json().total).toBe(2);
    expect(
      (defaultList.json().items as { id: string }[]).every((c) =>
        [activeCompany.json().id, activeIndividual.json().id].includes(c.id),
      ),
    ).toBe(true);

    const archivedOnly = await ctx.inject({
      method: "GET",
      url: "/api/clients?isActive=false",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(archivedOnly.json().total).toBe(1);
    expect(archivedOnly.json().items[0].id).toBe(toArchive.json().id);

    const companies = await ctx.inject({
      method: "GET",
      url: `/api/clients?kind=${ClientKind.COMPANY}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(companies.json().total).toBe(1);
    expect(companies.json().items[0].kind).toBe(ClientKind.COMPANY);

    const page1 = await ctx.inject({
      method: "GET",
      url: "/api/clients?page=1&pageSize=1&sort=name",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(page1.json().items).toHaveLength(1);
    expect(page1.json().total).toBe(2);
    expect(page1.json().page).toBe(1);
    expect(page1.json().pageSize).toBe(1);

    const page2 = await ctx.inject({
      method: "GET",
      url: "/api/clients?page=2&pageSize=1&sort=name",
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(page2.json().items).toHaveLength(1);
    expect(page2.json().page).toBe(2);
  });

  it("archived clients cannot be edited except reactivation", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "To Archive ООД",
        eik: EIK_VALID.short[3],
      },
    });
    const id = created.json().id as string;

    await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: false },
    });

    const blocked = await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { name: "Renamed" },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().code).toBe(ErrorCode.VALIDATION_FAILED);

    const blockedMix = await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: true, name: "Also Rename" },
    });
    expect(blockedMix.statusCode).toBe(400);
    expect(blockedMix.json().code).toBe(ErrorCode.VALIDATION_FAILED);

    const reactivated = await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: true },
    });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json().isActive).toBe(true);
    expect(reactivated.json().name).toBe("To Archive ООД");

    const getOne = await ctx.inject({
      method: "GET",
      url: `/api/clients/${id}`,
      headers: { cookie: cookieHeader(admin.cookies) },
    });
    expect(getOne.statusCode).toBe(200);
    expect(getOne.json().isActive).toBe(true);
  });

  it("normalizes phone to E.164 and lowercases email", async () => {
    const admin = await adminSession(ctx);
    const created = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.INDIVIDUAL,
        name: "Contact Me",
        phone: "0888 654 321",
        email: "HELLO@MAIL.COM",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().phone).toBe("+359888654321");
    expect(created.json().email).toBe("hello@mail.com");

    const updated = await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${created.json().id}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { phone: "00359888111222", email: "NEW@Example.org" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().phone).toBe("+359888111222");
    expect(updated.json().email).toBe("new@example.org");
  });

  it("permissions: FIELD may read (scoped); POST/PATCH still 403", async () => {
    const admin = await adminSession(ctx);
    const office = await createDbUser(ctx, "clients-office@example.com", Role.OFFICE);
    const field = await createDbUser(ctx, "clients-field@example.com", Role.FIELD);

    const created = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Perms Co",
        eik: EIK_VALID.short[4],
      },
    });
    const clientId = created.json().id as string;

    const officeList = await ctx.inject({
      method: "GET",
      url: "/api/clients",
      headers: { cookie: cookieHeader(office.cookies) },
    });
    expect(officeList.statusCode).toBe(200);

    const officeCreate = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(office.cookies) },
      payload: { kind: ClientKind.INDIVIDUAL, name: "Office Individual" },
    });
    expect(officeCreate.statusCode).toBe(201);

    // No sites yet → FIELD list is empty; out-of-scope get is 404.
    const fieldList = await ctx.inject({
      method: "GET",
      url: "/api/clients",
      headers: { cookie: cookieHeader(field.cookies) },
    });
    expect(fieldList.statusCode).toBe(200);
    expect(fieldList.json().items).toEqual([]);

    const fieldGet = await ctx.inject({
      method: "GET",
      url: `/api/clients/${clientId}`,
      headers: { cookie: cookieHeader(field.cookies) },
    });
    expect(fieldGet.statusCode).toBe(404);

    for (const route of [
      {
        method: "POST" as const,
        url: "/api/clients",
        payload: { kind: ClientKind.INDIVIDUAL, name: "Field Blocked" },
      },
      {
        method: "PATCH" as const,
        url: `/api/clients/${clientId}`,
        payload: { notes: "nope" },
      },
    ]) {
      const res = await ctx.inject({
        method: route.method,
        url: route.url,
        headers: {
          origin: "http://localhost:5173",
          cookie: cookieHeader(field.cookies),
        },
        payload: route.payload,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it("create, update, and archive produce audit_log rows with correct actor_user_id", async () => {
    const admin = await adminSession(ctx);

    const created = await ctx.inject({
      method: "POST",
      url: "/api/clients",
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: {
        kind: ClientKind.COMPANY,
        name: "Audit Trail ЕООД",
        eik: EIK_VALID.short[0],
        notes: "initial",
      },
    });
    expect(created.statusCode).toBe(201);
    const clientId = created.json().id as string;

    await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${clientId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { notes: "updated note" },
    });

    await ctx.inject({
      method: "PATCH",
      url: `/api/clients/${clientId}`,
      headers: { origin: "http://localhost:5173", cookie: cookieHeader(admin.cookies) },
      payload: { isActive: false },
    });

    const rows = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "clients", entityId: clientId },
      orderBy: { occurredAt: "asc" },
    });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["CREATE", "UPDATE", "UPDATE"]),
    );
    for (const row of rows) {
      expect(row.actorUserId).toBe(admin.id);
    }
    const archiveRow = rows.find(
      (r) => r.action === "UPDATE" && r.changedFields.includes("is_active"),
    );
    expect(archiveRow).toBeDefined();
    expect(archiveRow?.after).toMatchObject({ is_active: false });
  });
});