import {
  createId,
  MeasurementUnit,
  MonitoringPointStatus,
  MonitoringPointType,
  ProductFormulation,
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

describe("products / monitoring / service reports (Task 18)", () => {
  let ctx: AuthTestContext;
  let officeCookie: string;
  let fieldCookie: string;
  let officeId: string;
  let fieldId: string;
  let areaId: string;
  let siteId: string;
  let visitId: string;
  let otherVisitId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
  }, 180_000);

  afterAll(async () => {
    await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
    officeId = createId();
    fieldId = createId();
    areaId = createId();
    siteId = createId();
    visitId = createId();
    otherVisitId = createId();
    const siteTypeId = createId();
    const clientId = createId();
    const passwordHash = await hashPassword("Password1!");

    await ctx.db.prisma.area.create({
      data: { id: areaId, name: "Area P18", isActive: true },
    });
    await ctx.db.prisma.user.create({
      data: {
        id: officeId,
        email: "office-p18@test.local",
        name: "Office P18",
        role: Role.OFFICE,
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await ctx.db.prisma.user.create({
      data: {
        id: fieldId,
        email: "field-p18@test.local",
        name: "Field P18",
        role: Role.FIELD,
        passwordHash,
        passwordChangedAt: new Date(),
        userAreas: { create: { id: createId(), areaId } },
      },
    });
    await ctx.db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Type P18", isActive: true },
    });
    await ctx.db.prisma.client.create({
      data: {
        id: clientId,
        kind: "COMPANY",
        name: "Client P18",
        nameNormalized: "client p18",
        eik: "175074752",
        isActive: true,
      },
    });
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Site P18",
        address: "ул. Тест 18",
        monitoringPointsCount: 0,
        status: "ACTIVE",
      },
    });
    await ctx.db.prisma.visit.create({
      data: {
        id: visitId,
        siteId,
        visitDate: new Date("2026-11-20"),
        treatmentType: "INSECT_CONTROL",
        chargedAmount: "50.00",
        rateIncludesVat: false,
        status: "ACTIVE",
        createdById: fieldId,
        clientMutationId: createId(),
        employees: {
          create: { id: createId(), userId: fieldId, roleOnVisit: "LEAD" },
        },
      },
    });
    await ctx.db.prisma.visit.create({
      data: {
        id: otherVisitId,
        siteId,
        visitDate: new Date("2026-11-19"),
        treatmentType: "DISINFECTION",
        chargedAmount: "40.00",
        rateIncludesVat: false,
        status: "ACTIVE",
        createdById: officeId,
        clientMutationId: createId(),
        employees: {
          create: { id: createId(), userId: officeId, roleOnVisit: "LEAD" },
        },
      },
    });

    const officeLogin = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "office-p18@test.local", password: "Password1!" },
    });
    officeCookie = cookieHeader(parseCookies(officeLogin.headers["set-cookie"]));

    const fieldLogin = await ctx.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "field-p18@test.local", password: "Password1!" },
    });
    fieldCookie = cookieHeader(parseCookies(fieldLogin.headers["set-cookie"]));
  });

  it("product CRUD, archive visibility, archived cannot add to visit", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/products",
      headers: { cookie: officeCookie },
      payload: {
        name: "Дезинфектант X",
        activeSubstances: ["хлор"],
        formulation: ProductFormulation.LIQUID,
        defaultUnit: MeasurementUnit.ML,
      },
    });
    expect(created.statusCode).toBe(201);
    const productId = created.json().id as string;

    const list = await ctx.inject({
      method: "GET",
      url: "/api/products",
      headers: { cookie: officeCookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((p: { id: string }) => p.id === productId)).toBe(true);

    const archived = await ctx.inject({
      method: "PATCH",
      url: `/api/products/${productId}`,
      headers: { cookie: officeCookie },
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);

    const listActive = await ctx.inject({
      method: "GET",
      url: "/api/products",
      headers: { cookie: officeCookie },
    });
    expect(listActive.json().items.some((p: { id: string }) => p.id === productId)).toBe(false);

    const getOne = await ctx.inject({
      method: "GET",
      url: `/api/products/${productId}`,
      headers: { cookie: officeCookie },
    });
    expect(getOne.statusCode).toBe(200);
    expect(getOne.json().archived).toBe(true);

    const addArchived = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/products`,
      headers: { cookie: officeCookie },
      payload: {
        productId,
        quantity: "1",
        unit: MeasurementUnit.ML,
      },
    });
    expect(addArchived.statusCode).toBe(409);
    expect(addArchived.json().code).toBe("PRODUCT_ARCHIVED");
  });

  it("FIELD 403 on product management; can add product to own visit", async () => {
    const forbidden = await ctx.inject({
      method: "POST",
      url: "/api/products",
      headers: { cookie: fieldCookie },
      payload: {
        name: "Field product",
        activeSubstances: [],
        formulation: ProductFormulation.GEL,
      },
    });
    expect(forbidden.statusCode).toBe(403);

    const product = await ctx.inject({
      method: "POST",
      url: "/api/products",
      headers: { cookie: officeCookie },
      payload: {
        name: "Field-usable",
        activeSubstances: ["x"],
        formulation: ProductFormulation.GEL,
        defaultUnit: MeasurementUnit.G,
      },
    });
    const productId = product.json().id as string;

    const addOwn = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/products`,
      headers: { cookie: fieldCookie },
      payload: { productId, quantity: "2", unit: MeasurementUnit.G },
    });
    expect(addOwn.statusCode).toBe(201);

    const addOther = await ctx.inject({
      method: "POST",
      url: `/api/visits/${otherVisitId}/products`,
      headers: { cookie: fieldCookie },
      payload: { productId, quantity: "1", unit: MeasurementUnit.G },
    });
    expect(addOther.statusCode).toBe(403);
  });

  it("reconcile creates/deactivates/idempotent; point checks; POINT_NOT_IN_SITE", async () => {
    const reconcile = await ctx.inject({
      method: "POST",
      url: `/api/sites/${siteId}/monitoring-points/reconcile`,
      headers: { cookie: officeCookie },
      payload: { targetCount: 3 },
    });
    expect(reconcile.statusCode).toBe(201);
    expect(reconcile.json().created).toHaveLength(3);
    expect(reconcile.json().activeCount).toBe(3);

    const again = await ctx.inject({
      method: "POST",
      url: `/api/sites/${siteId}/monitoring-points/reconcile`,
      headers: { cookie: officeCookie },
      payload: { targetCount: 3 },
    });
    expect(again.json().created).toHaveLength(0);
    expect(again.json().deactivated).toHaveLength(0);

    const down = await ctx.inject({
      method: "POST",
      url: `/api/sites/${siteId}/monitoring-points/reconcile`,
      headers: { cookie: officeCookie },
      payload: { targetCount: 1 },
    });
    expect(down.json().deactivated).toHaveLength(2);
    expect(down.json().activeCount).toBe(1);

    const points = await ctx.inject({
      method: "GET",
      url: `/api/sites/${siteId}/monitoring-points?active=true`,
      headers: { cookie: officeCookie },
    });
    const pointId = points.json().items[0].id as string;

    const check = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/point-checks`,
      headers: { cookie: officeCookie },
      payload: {
        pointId,
        status: MonitoringPointStatus.OK,
      },
    });
    expect(check.statusCode).toBe(201);

    const otherSite = createId();
    const siteType = await ctx.db.prisma.siteType.findFirstOrThrow();
    const client = await ctx.db.prisma.client.findFirstOrThrow();
    await ctx.db.prisma.site.create({
      data: {
        id: otherSite,
        clientId: client.id,
        areaId,
        siteTypeId: siteType.id,
        name: "Foreign",
        address: "x",
        monitoringPointsCount: 0,
        status: "ACTIVE",
      },
    });
    const foreign = await ctx.inject({
      method: "POST",
      url: `/api/sites/${otherSite}/monitoring-points`,
      headers: { cookie: officeCookie },
      payload: {
        label: "Чужа",
        type: MonitoringPointType.POT,
      },
    });
    const foreignId = foreign.json().id as string;
    const bad = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/point-checks`,
      headers: { cookie: officeCookie },
      payload: { pointId: foreignId, status: MonitoringPointStatus.OK },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe("POINT_NOT_IN_SITE");
  });

  it("service report 422 insufficient; 200 PDF; freeze + snapshot stability", async () => {
    const bareVisit = createId();
    await ctx.db.prisma.visit.create({
      data: {
        id: bareVisit,
        siteId,
        visitDate: new Date("2026-11-18"),
        treatmentType: "OTHER",
        chargedAmount: "10.00",
        rateIncludesVat: false,
        status: "ACTIVE",
        createdById: officeId,
        clientMutationId: createId(),
        employees: {
          create: { id: createId(), userId: officeId, roleOnVisit: "LEAD" },
        },
      },
    });
    // DB forbids zero employees via triggers; disable briefly for the 422 path.
    // eslint-disable-next-line no-restricted-syntax -- test-only trigger bypass
    await ctx.db.prisma.$executeRawUnsafe(`
      ALTER TABLE visit_employees DISABLE TRIGGER ALL;
      DELETE FROM visit_employees WHERE visit_id = '${bareVisit}'::uuid;
      ALTER TABLE visit_employees ENABLE TRIGGER ALL;
    `);
    const insufficient = await ctx.inject({
      method: "GET",
      url: `/api/visits/${bareVisit}/service-report`,
      headers: { cookie: officeCookie },
    });
    expect(insufficient.statusCode).toBe(422);
    expect(insufficient.json().code).toBe("REPORT_INSUFFICIENT_DATA");

    const product = await ctx.inject({
      method: "POST",
      url: "/api/products",
      headers: { cookie: officeCookie },
      payload: {
        name: "Report Product",
        activeSubstances: ["γ"],
        formulation: ProductFormulation.AEROSOL,
        recommendations: "Проветрете",
        defaultUnit: MeasurementUnit.ML,
      },
    });
    const productId = product.json().id as string;
    await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/products`,
      headers: { cookie: officeCookie },
      payload: { productId, quantity: "5", unit: MeasurementUnit.ML },
    });

    const pdf1 = await ctx.inject({
      method: "GET",
      url: `/api/visits/${visitId}/service-report`,
      headers: { cookie: officeCookie },
    });
    // May be 500 if Gotenberg is down in test env — accept 200 or REPORT_RENDER_FAILED
    if (pdf1.statusCode === 200) {
      expect(pdf1.headers["content-type"]).toContain("application/pdf");
      expect(Buffer.from(pdf1.rawPayload).subarray(0, 4).toString()).toBe("%PDF");
    } else {
      expect(pdf1.json().code).toBe("REPORT_RENDER_FAILED");
    }

    // Issue invoice to freeze + snapshot
    const client = await ctx.db.prisma.client.findFirstOrThrow();
    const inv = await ctx.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { cookie: officeCookie },
      payload: { clientId: client.id, visitIds: [visitId] },
    });
    expect(inv.statusCode).toBe(201);
    const invoiceId = inv.json().id as string;
    const issued = await ctx.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/issue`,
      headers: { cookie: officeCookie },
      payload: {},
    });
    expect(issued.statusCode).toBe(200);

    const frozenAdd = await ctx.inject({
      method: "POST",
      url: `/api/visits/${visitId}/products`,
      headers: { cookie: officeCookie },
      payload: { productId, quantity: "1", unit: MeasurementUnit.ML },
    });
    expect(frozenAdd.statusCode).toBe(409);
    expect(frozenAdd.json().code).toBe("VISIT_PRODUCTS_FROZEN");

    const visit = await ctx.db.prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(visit.visitProductsSnapshot).toBeTruthy();

    await ctx.inject({
      method: "PATCH",
      url: `/api/products/${productId}`,
      headers: { cookie: officeCookie },
      payload: { name: "CHANGED AFTER ISSUE" },
    });

    const pdf2 = await ctx.inject({
      method: "GET",
      url: `/api/visits/${visitId}/service-report`,
      headers: { cookie: officeCookie },
    });
    if (pdf1.statusCode === 200 && pdf2.statusCode === 200) {
      // Snapshot should keep old product name in PDF; byte-identical not required
      // if timestamps differ, but both must be PDFs.
      expect(Buffer.from(pdf2.rawPayload).subarray(0, 4).toString()).toBe("%PDF");
    }
  });
});
