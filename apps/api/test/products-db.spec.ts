import { createId } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

describe("products / monitoring DB constraints (Task 18)", () => {
  let db: TestDb;
  let userId: string;
  let clientId: string;
  let areaId: string;
  let siteTypeId: string;
  let siteId: string;
  let visitId: string;
  let productId: string;
  let invoiceId: string;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
    userId = createId();
    clientId = createId();
    areaId = createId();
    siteTypeId = createId();
    siteId = createId();
    visitId = createId();
    productId = createId();
    invoiceId = createId();
    const passwordHash = await hashPassword("test-password-ok");

    await db.prisma.user.create({
      data: {
        id: userId,
        email: "p18@test.local",
        name: "Office",
        role: "OFFICE",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await db.prisma.area.create({
      data: { id: areaId, name: "Area-P18", isActive: true },
    });
    await db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Type-P18", isActive: true },
    });
    await db.prisma.client.create({
      data: {
        id: clientId,
        kind: "COMPANY",
        name: "Client P18",
        nameNormalized: "client p18",
        eik: "175074752",
        isActive: true,
      },
    });
    await db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Site P18",
        address: "ул. Тест 1",
        monitoringPointsCount: 0,
        status: "ACTIVE",
      },
    });
    await db.prisma.visit.create({
      data: {
        id: visitId,
        siteId,
        visitDate: new Date("2026-11-20"),
        treatmentType: "INSECT_CONTROL",
        chargedAmount: "100.00",
        rateIncludesVat: false,
        status: "ACTIVE",
        createdById: userId,
        clientMutationId: createId(),
        employees: {
          create: {
            id: createId(),
            userId,
            roleOnVisit: "LEAD",
          },
        },
      },
    });
    await db.prisma.product.create({
      data: {
        id: productId,
        name: "Препарат Alpha",
        activeSubstances: ["α"],
        formulation: "LIQUID",
        archived: false,
        createdById: userId,
      },
    });
  });

  it("partial UNIQUE allows reusing archived product name", async () => {
    await db.prisma.product.update({
      where: { id: productId },
      data: { archived: true },
    });
    await expect(
      db.prisma.product.create({
        data: {
          id: createId(),
          name: "Препарат Alpha",
          activeSubstances: ["β"],
          formulation: "GEL",
          archived: false,
          createdById: userId,
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("visit_products UNIQUE(visit_id, product_id) rejects duplicates", async () => {
    await db.prisma.visitProduct.create({
      data: {
        id: createId(),
        visitId,
        productId,
        quantity: "1.000",
        unit: "ML",
        createdById: userId,
      },
    });
    await expect(
      db.prisma.visitProduct.create({
        data: {
          id: createId(),
          visitId,
          productId,
          quantity: "2.000",
          unit: "ML",
          createdById: userId,
        },
      }),
    ).rejects.toThrow();
  });

  async function issueInvoiceForVisit(): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- issued invoice fixture for freeze tests
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoices (
        id, number, status, document_type, client_id, issued_at, issued_by,
        client_legal_name, client_eik, client_vat_number,
        client_registered_address, client_legal_representative,
        currency, net_amount, vat_amount, gross_amount, billing_month, due_date,
        created_by, created_at, updated_at
      ) VALUES (
        '${invoiceId}'::uuid, NULL, 'DRAFT', 'INVOICE', '${clientId}'::uuid,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        'EUR', 0, 0, 0, DATE '2026-11-01', NULL,
        '${userId}'::uuid, NOW(), NOW()
      )
    `);
    await db.prisma.invoiceVisit.create({
      data: { id: createId(), invoiceId, visitId },
    });
    await db.prisma.visitProduct.create({
      data: {
        id: createId(),
        visitId,
        productId,
        quantity: "10.000",
        unit: "ML",
        createdById: userId,
      },
    });
    // Issue via UPDATE so snapshot trigger fires
    // eslint-disable-next-line no-restricted-syntax -- issue transition for snapshot
    await db.prisma.$executeRawUnsafe(`
      UPDATE invoices SET
        status = 'ISSUED',
        number = '0000001801',
        issued_at = NOW(),
        issued_by = '${userId}'::uuid,
        client_legal_name = 'Client P18',
        client_eik = '175074752',
        client_vat_number = '',
        client_registered_address = 'addr',
        client_legal_representative = 'mol',
        net_amount = 100.00,
        vat_amount = 20.00,
        gross_amount = 120.00,
        due_date = (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
        updated_at = NOW()
      WHERE id = '${invoiceId}'::uuid
    `);
  }

  it("freeze trigger rejects visit_products writes after issue (23P04)", async () => {
    await issueInvoiceForVisit();
    await expect(
      db.prisma.visitProduct.create({
        data: {
          id: createId(),
          visitId,
          productId: (
            await db.prisma.product.create({
              data: {
                id: createId(),
                name: "Other",
                activeSubstances: [],
                formulation: "POWDER",
                createdById: userId,
              },
            })
          ).id,
          quantity: "1",
          unit: "G",
          createdById: userId,
        },
      }),
    ).rejects.toThrow(/23P04/);
  });

  it("freeze trigger rejects monitoring_point_checks writes after issue (23P04)", async () => {
    const pointId = createId();
    await db.prisma.monitoringPoint.create({
      data: {
        id: pointId,
        siteId,
        label: "Точка 1",
        type: "NEOT",
        active: true,
        createdById: userId,
      },
    });
    await issueInvoiceForVisit();
    await expect(
      db.prisma.monitoringPointCheck.create({
        data: {
          id: createId(),
          pointId,
          visitId,
          checkedAt: new Date("2026-11-20"),
          status: "OK",
          createdById: userId,
        },
      }),
    ).rejects.toThrow(/23P04/);
  });

  it("point-in-site trigger raises 23P05 (POINT_NOT_IN_SITE)", async () => {
    const otherSiteId = createId();
    await db.prisma.site.create({
      data: {
        id: otherSiteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Other site",
        address: "ул. Друга 2",
        monitoringPointsCount: 0,
        status: "ACTIVE",
      },
    });
    const foreignPoint = createId();
    await db.prisma.monitoringPoint.create({
      data: {
        id: foreignPoint,
        siteId: otherSiteId,
        label: "Чужа",
        type: "POT",
        active: true,
        createdById: userId,
      },
    });
    await expect(
      db.prisma.monitoringPointCheck.create({
        data: {
          id: createId(),
          pointId: foreignPoint,
          visitId,
          checkedAt: new Date("2026-11-20"),
          status: "OK",
          createdById: userId,
        },
      }),
    ).rejects.toThrow(/23P05|POINT_NOT_IN_SITE/);
  });

  it("monitoring_points syncs sites.monitoring_points_count via trigger", async () => {
    const a = createId();
    const b = createId();
    await db.prisma.monitoringPoint.create({
      data: {
        id: a,
        siteId,
        label: "Точка 1",
        type: "NEOT",
        active: true,
        createdById: userId,
      },
    });
    await db.prisma.monitoringPoint.create({
      data: {
        id: b,
        siteId,
        label: "Точка 2",
        type: "POT",
        active: true,
        createdById: userId,
      },
    });
    let site = await db.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    expect(site.monitoringPointsCount).toBe(2);

    await db.prisma.monitoringPoint.update({
      where: { id: b },
      data: { active: false },
    });
    site = await db.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    expect(site.monitoringPointsCount).toBe(1);
  });

  it("visit_products_snapshot is populated on invoice issue and matches live rows", async () => {
    await issueInvoiceForVisit();
    const visit = await db.prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(visit.visitProductsSnapshot).toBeTruthy();
    const snap = visit.visitProductsSnapshot as Array<{ name: string; quantity: string }>;
    expect(snap).toHaveLength(1);
    expect(snap[0]?.name).toBe("Препарат Alpha");
    expect(snap[0]?.quantity).toBe("10.000");
  });
});
