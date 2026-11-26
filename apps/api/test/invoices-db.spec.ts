import { createId } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

/**
 * Constraint / trigger tests that bypass the API and talk to Postgres directly.
 */
describe("invoices DB constraints", () => {
  let db: TestDb;
  let clientId: string;
  let siteId: string;
  let userId: string;
  let visitId: string;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
    const areaId = createId();
    clientId = createId();
    const typeId = createId();
    siteId = createId();
    userId = createId();
    visitId = createId();

    await db.prisma.area.create({ data: { id: areaId, name: "A", isActive: true } });
    await db.prisma.client.create({
      data: {
        id: clientId,
        kind: "INDIVIDUAL",
        name: "Client",
        nameNormalized: "client",
        eik: "175074752",
        isActive: true,
      },
    });
    await db.prisma.siteType.create({
      data: { id: typeId, name: "Офис", isActive: true },
    });
    await db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId: typeId,
        name: "Site",
        address: "Addr",
        status: "ACTIVE",
      },
    });
    const passwordHash = await hashPassword("test-password-ok");
    await db.prisma.user.create({
      data: {
        id: userId,
        email: "inv-db@test.local",
        name: "Inv",
        role: "OFFICE",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });

    // Deferred employee constraint requires visit+LEAD in the same transaction.
    // eslint-disable-next-line no-restricted-syntax -- setup visit+employee
    await db.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax -- setup visit+employee
      await tx.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${visitId}'::uuid, '${siteId}'::uuid, '2026-11-01'::date, 'INSECT_CONTROL',
          100.00, false, 'ACTIVE', '${userId}'::uuid, NOW(), NOW(), '${createId()}'::uuid
        )
      `);
      // eslint-disable-next-line no-restricted-syntax -- setup visit+employee
      await tx.$executeRawUnsafe(`
        INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
        VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${userId}'::uuid, 'LEAD')
      `);
    });
  });

  async function insertIssuedInvoice(opts?: { id?: string; number?: string }) {
    const id = opts?.id ?? createId();
    const number = opts?.number ?? "0000000001";
    // eslint-disable-next-line no-restricted-syntax -- insert issued row for immutability tests
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoices (
        id, number, status, document_type, client_id, issued_at, issued_by,
        client_legal_name, client_eik, client_vat_number,
        client_registered_address, client_legal_representative,
        currency, net_amount, vat_amount, gross_amount, billing_month, due_date,
        created_by, created_at, updated_at
      ) VALUES (
        '${id}'::uuid, '${number}', 'ISSUED', 'INVOICE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
        'Client', '175074752', '', '', '',
        'EUR', 100.00, 20.00, 120.00, DATE '2026-09-01', (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
        '${userId}'::uuid, NOW(), NOW()
      )
    `);
    const lineId = createId();
    // eslint-disable-next-line no-restricted-syntax -- insert issued line
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoice_lines (
        id, invoice_id, line_no, description, quantity, unit_price, vat_rate,
        line_total, vat_amount
      ) VALUES (
        '${lineId}'::uuid, '${id}'::uuid, 1, 'Line', 1.000, 100.00, 20.00, 100.00, 20.00
      )
    `);
    return { id, lineId };
  }

  it("rejects UPDATE of issued invoice with SQLSTATE 23P02 and writes 0 audit rows", async () => {
    const { id } = await insertIssuedInvoice();
    const beforeUpdate = await db.prisma.auditLog.count({
      where: { entityType: "invoices", entityId: id, action: "UPDATE" },
    });

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutability test
      db.prisma.$executeRawUnsafe(`
        UPDATE invoices SET notes = 'hack' WHERE id = '${id}'::uuid
      `),
    ).rejects.toThrow(/23P02|immutable/i);

    const afterUpdate = await db.prisma.auditLog.count({
      where: { entityType: "invoices", entityId: id, action: "UPDATE" },
    });
    expect(afterUpdate).toBe(beforeUpdate);
  });

  it("rejects DELETE of issued invoice with SQLSTATE 23P02", async () => {
    const { id } = await insertIssuedInvoice({ number: "0000000002" });
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutability test
      db.prisma.$executeRawUnsafe(`
        DELETE FROM invoices WHERE id = '${id}'::uuid
      `),
    ).rejects.toThrow(/23P02|immutable/i);
  });

  it("rejects UPDATE of line on issued invoice with SQLSTATE 23P02", async () => {
    const { lineId } = await insertIssuedInvoice({ number: "0000000003" });
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutability test
      db.prisma.$executeRawUnsafe(`
        UPDATE invoice_lines SET description = 'hack' WHERE id = '${lineId}'::uuid
      `),
    ).rejects.toThrow(/23P02|immutable/i);
  });

  it("enforces UNIQUE(visit_id) on invoice_visit", async () => {
    const inv1 = createId();
    const inv2 = createId();
    await db.prisma.invoice.create({
      data: {
        id: inv1,
        status: "DRAFT",
        documentType: "INVOICE",
        clientId,
        currency: "EUR",
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
        billingMonth: new Date("2026-09-01T00:00:00.000Z"),
        createdById: userId,
      },
    });
    await db.prisma.invoice.create({
      data: {
        id: inv2,
        status: "DRAFT",
        documentType: "INVOICE",
        clientId,
        currency: "EUR",
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
        billingMonth: new Date("2026-09-01T00:00:00.000Z"),
        createdById: userId,
      },
    });
    await db.prisma.invoiceVisit.create({
      data: { id: createId(), invoiceId: inv1, visitId },
    });
    await expect(
      db.prisma.invoiceVisit.create({
        data: { id: createId(), invoiceId: inv2, visitId },
      }),
    ).rejects.toThrow(/unique|P2002|invoice_visit_visit_id/i);
  });

  it("maintains draft invoice totals from line inserts", async () => {
    const invId = createId();
    await db.prisma.invoice.create({
      data: {
        id: invId,
        status: "DRAFT",
        documentType: "INVOICE",
        clientId,
        currency: "EUR",
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
        billingMonth: new Date("2026-09-01T00:00:00.000Z"),
        createdById: userId,
      },
    });
    await db.prisma.invoiceLine.create({
      data: {
        id: createId(),
        invoiceId: invId,
        lineNo: 1,
        description: "A",
        quantity: "1.000",
        unitPrice: "50.00",
        vatRate: "20.00",
        lineTotal: "50.00",
        vatAmount: "10.00",
      },
    });
    const row = await db.prisma.invoice.findUniqueOrThrow({ where: { id: invId } });
    expect(Number(row.netAmount)).toBe(50);
    expect(Number(row.vatAmount)).toBe(10);
    expect(Number(row.grossAmount)).toBe(60);
  });

  it("seeds invoice_counters default row with next_value >= 1", async () => {
    const counter = await db.prisma.invoiceCounter.findUnique({ where: { id: "default" } });
    expect(counter).not.toBeNull();
    expect(counter!.nextValue).toBeGreaterThanOrEqual(1);
  });

  it("allows UPDATE and DELETE on DRAFT invoices and lines", async () => {
    const invId = createId();
    const lineId = createId();
    await db.prisma.invoice.create({
      data: {
        id: invId,
        status: "DRAFT",
        documentType: "INVOICE",
        clientId,
        currency: "EUR",
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
        billingMonth: new Date("2026-09-01T00:00:00.000Z"),
        createdById: userId,
      },
    });
    await db.prisma.invoiceLine.create({
      data: {
        id: lineId,
        invoiceId: invId,
        lineNo: 1,
        description: "A",
        quantity: "1.000",
        unitPrice: "10.00",
        vatRate: "20.00",
        lineTotal: "10.00",
        vatAmount: "2.00",
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- draft mutability
    await db.prisma.$executeRawUnsafe(`
      UPDATE invoices SET notes = 'ok' WHERE id = '${invId}'::uuid
    `);
    // eslint-disable-next-line no-restricted-syntax -- draft line mutability
    await db.prisma.$executeRawUnsafe(`
      UPDATE invoice_lines SET description = 'B' WHERE id = '${lineId}'::uuid
    `);
    // eslint-disable-next-line no-restricted-syntax -- delete line before invoice (no cascade)
    await db.prisma.$executeRawUnsafe(`
      DELETE FROM invoice_lines WHERE id = '${lineId}'::uuid
    `);
    // eslint-disable-next-line no-restricted-syntax -- draft delete
    await db.prisma.$executeRawUnsafe(`
      DELETE FROM invoices WHERE id = '${invId}'::uuid
    `);
  });

  it("refuses DELETE of DRAFT invoice while lines exist (FK RESTRICT, no cascade)", async () => {
    const invId = createId();
    await db.prisma.invoice.create({
      data: {
        id: invId,
        status: "DRAFT",
        documentType: "INVOICE",
        clientId,
        currency: "EUR",
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
        billingMonth: new Date("2026-09-01T00:00:00.000Z"),
        createdById: userId,
      },
    });
    await db.prisma.invoiceLine.create({
      data: {
        id: createId(),
        invoiceId: invId,
        lineNo: 1,
        description: "A",
        quantity: "1.000",
        unitPrice: "10.00",
        vatRate: "20.00",
        lineTotal: "10.00",
        vatAmount: "2.00",
      },
    });

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- cascade refusal
      db.prisma.$executeRawUnsafe(`
        DELETE FROM invoices WHERE id = '${invId}'::uuid
      `),
    ).rejects.toThrow(/restrict|foreign key|23503/i);
  });

  it("gross_amount = net + vat CHECK fires when totals trigger is disabled", async () => {
    const invId = createId();
    // eslint-disable-next-line no-restricted-syntax -- prove CHECK is a second line of defense
    await db.prisma.$executeRawUnsafe(`
      ALTER TABLE invoice_lines DISABLE TRIGGER USER;
      ALTER TABLE invoices DISABLE TRIGGER USER;
    `);
    try {
      await expect(
        // eslint-disable-next-line no-restricted-syntax -- mismatched totals insert
        db.prisma.$executeRawUnsafe(`
          INSERT INTO invoices (
            id, number, status, document_type, client_id, issued_at, issued_by,
            client_legal_name, client_eik, client_vat_number,
            client_registered_address, client_legal_representative,
            currency, net_amount, vat_amount, gross_amount, billing_month, due_date,
            created_by, created_at, updated_at
          ) VALUES (
            '${invId}'::uuid, '0000000099', 'ISSUED', 'INVOICE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
            'Client', '175074752', '', '', '',
            'EUR', 100.00, 20.00, 999.00, DATE '2026-09-01', DATE '2026-10-01',
            '${userId}'::uuid, NOW(), NOW()
          )
        `),
      ).rejects.toThrow(/check|gross|23514/i);
    } finally {
      // eslint-disable-next-line no-restricted-syntax -- re-enable triggers
      await db.prisma.$executeRawUnsafe(`
        ALTER TABLE invoice_lines ENABLE TRIGGER USER;
        ALTER TABLE invoices ENABLE TRIGGER USER;
      `);
    }
  });

  it("partial UNIQUE rejects a second CREDIT_NOTE for the same invoice", async () => {
    const { id: originalId } = await insertIssuedInvoice({ number: "0000000200" });
    const credit1 = createId();
    const credit2 = createId();
    // eslint-disable-next-line no-restricted-syntax -- credit note insert
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoices (
        id, number, status, document_type, client_id, issued_at, issued_by,
        client_legal_name, client_eik, client_vat_number,
        client_registered_address, client_legal_representative,
        currency, net_amount, vat_amount, gross_amount, due_date,
        references_invoice_id, credit_note_reason,
        created_by, created_at, updated_at
      ) VALUES (
        '${credit1}'::uuid, '0000000201', 'ISSUED', 'CREDIT_NOTE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
        'Client', '175074752', '', '', '',
        'EUR', 100.00, 20.00, 120.00, (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
        '${originalId}'::uuid, 'грешка при сумата',
        '${userId}'::uuid, NOW(), NOW()
      )
    `);
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- second credit note
      db.prisma.$executeRawUnsafe(`
        INSERT INTO invoices (
          id, number, status, document_type, client_id, issued_at, issued_by,
          client_legal_name, client_eik, client_vat_number,
          client_registered_address, client_legal_representative,
          currency, net_amount, vat_amount, gross_amount, due_date,
          references_invoice_id, credit_note_reason,
          created_by, created_at, updated_at
        ) VALUES (
          '${credit2}'::uuid, '0000000202', 'ISSUED', 'CREDIT_NOTE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
          'Client', '175074752', '', '', '',
          'EUR', 50.00, 10.00, 60.00, (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
          '${originalId}'::uuid, 'втори опит',
          '${userId}'::uuid, NOW(), NOW()
        )
      `),
    ).rejects.toThrow(/unique|23505|one_credit_note/i);

    const original = await db.prisma.invoice.findUniqueOrThrow({ where: { id: originalId } });
    expect(original.status).toBe("CANCELLED_BY_CREDIT_NOTE");
  });

  it("allows ISSUED→CANCELLED_BY_CREDIT_NOTE only when credit note exists; otherwise 23P02", async () => {
    const { id } = await insertIssuedInvoice({ number: "0000000210" });
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- cancel without credit note
      db.prisma.$executeRawUnsafe(`
        UPDATE invoices SET status = 'CANCELLED_BY_CREDIT_NOTE' WHERE id = '${id}'::uuid
      `),
    ).rejects.toThrow(/23P02|immutable/i);

    const creditId = createId();
    // eslint-disable-next-line no-restricted-syntax -- credit note then cancel is automatic
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoices (
        id, number, status, document_type, client_id, issued_at, issued_by,
        client_legal_name, client_eik, client_vat_number,
        client_registered_address, client_legal_representative,
        currency, net_amount, vat_amount, gross_amount, due_date,
        references_invoice_id, credit_note_reason,
        created_by, created_at, updated_at
      ) VALUES (
        '${creditId}'::uuid, '0000000211', 'ISSUED', 'CREDIT_NOTE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
        'Client', '175074752', '', '', '',
        'EUR', 100.00, 20.00, 120.00, (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
        '${id}'::uuid, 'анулиране',
        '${userId}'::uuid, NOW(), NOW()
      )
    `);
    const row = await db.prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("CANCELLED_BY_CREDIT_NOTE");
  });

  it("allows email_sent_at / email_last_error updates on ISSUED; rejects notes change", async () => {
    const { id } = await insertIssuedInvoice({ number: "0000000220" });
    // eslint-disable-next-line no-restricted-syntax -- operational column update
    await db.prisma.$executeRawUnsafe(`
      UPDATE invoices SET email_sent_at = NOW() WHERE id = '${id}'::uuid
    `);
    // eslint-disable-next-line no-restricted-syntax -- operational column update
    await db.prisma.$executeRawUnsafe(`
      UPDATE invoices SET email_last_error = 'smtp fail' WHERE id = '${id}'::uuid
    `);
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- financial/notes still immutable
      db.prisma.$executeRawUnsafe(`
        UPDATE invoices SET notes = 'hack' WHERE id = '${id}'::uuid
      `),
    ).rejects.toThrow(/23P02|immutable/i);
  });
});
