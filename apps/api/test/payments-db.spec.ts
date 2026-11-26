import { createId } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

describe("payments DB constraints", () => {
  let db: TestDb;
  let clientId: string;
  let userId: string;
  let fieldId: string;
  let invoiceId: string;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
    clientId = createId();
    userId = createId();
    fieldId = createId();
    invoiceId = createId();
    const passwordHash = await hashPassword("test-password-ok");

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
    await db.prisma.user.create({
      data: {
        id: userId,
        email: "pay-office@test.local",
        name: "Office",
        role: "OFFICE",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await db.prisma.user.create({
      data: {
        id: fieldId,
        email: "pay-field@test.local",
        name: "Field",
        role: "FIELD",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- issued invoice fixture
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoices (
        id, number, status, document_type, client_id, issued_at, issued_by,
        client_legal_name, client_eik, client_vat_number,
        client_registered_address, client_legal_representative,
        currency, net_amount, vat_amount, gross_amount, billing_month, due_date,
        created_by, created_at, updated_at
      ) VALUES (
        '${invoiceId}'::uuid, '0000000300', 'ISSUED', 'INVOICE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
        'Client', '175074752', '', '', '',
        'EUR', 100.00, 20.00, 120.00, DATE '2026-09-01',
        (NOW() AT TIME ZONE 'Europe/Sofia')::date + 30,
        '${userId}'::uuid, NOW(), NOW()
      )
    `);
  });

  it("rejects payment exceeding outstanding with 23P03", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- overpay trigger
      db.prisma.$executeRawUnsafe(`
        INSERT INTO payments (
          id, invoice_id, amount, method, paid_at, collected_by_user_id, created_by, created_at
        ) VALUES (
          '${createId()}'::uuid, '${invoiceId}'::uuid, 120.01, 'BANK_TRANSFER',
          (NOW() AT TIME ZONE 'Europe/Sofia')::date, NULL, '${userId}'::uuid, NOW()
        )
      `),
    ).rejects.toThrow(/23P03|exceed/i);
  });

  it("rejects UPDATE and DELETE on payments with 23P02", async () => {
    const payId = createId();
    // eslint-disable-next-line no-restricted-syntax -- insert payment
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO payments (
        id, invoice_id, amount, method, paid_at, collected_by_user_id, created_by, created_at
      ) VALUES (
        '${payId}'::uuid, '${invoiceId}'::uuid, 50.00, 'BANK_TRANSFER',
        (NOW() AT TIME ZONE 'Europe/Sofia')::date, NULL, '${userId}'::uuid, NOW()
      )
    `);
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutable update
      db.prisma.$executeRawUnsafe(
        `UPDATE payments SET amount = 10.00 WHERE id = '${payId}'::uuid`,
      ),
    ).rejects.toThrow(/23P02|immutable/i);
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutable delete
      db.prisma.$executeRawUnsafe(`DELETE FROM payments WHERE id = '${payId}'::uuid`),
    ).rejects.toThrow(/23P02|immutable/i);
  });

  it("rejects UPDATE and DELETE on cash_handovers with 23P02", async () => {
    const hid = createId();
    // eslint-disable-next-line no-restricted-syntax -- insert handover
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO cash_handovers (
        id, employee_id, amount, handed_over_at, received_by_user_id, created_by, created_at
      ) VALUES (
        '${hid}'::uuid, '${fieldId}'::uuid, 50.00,
        (NOW() AT TIME ZONE 'Europe/Sofia')::date, '${userId}'::uuid, '${userId}'::uuid, NOW()
      )
    `);
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutable update
      db.prisma.$executeRawUnsafe(
        `UPDATE cash_handovers SET amount = 10.00 WHERE id = '${hid}'::uuid`,
      ),
    ).rejects.toThrow(/23P02|immutable/i);
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- immutable delete
      db.prisma.$executeRawUnsafe(`DELETE FROM cash_handovers WHERE id = '${hid}'::uuid`),
    ).rejects.toThrow(/23P02|immutable/i);
  });

  it("CASH without collected_by rejected; non-CASH with collected_by rejected", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- CHECK cash collector
      db.prisma.$executeRawUnsafe(`
        INSERT INTO payments (
          id, invoice_id, amount, method, paid_at, collected_by_user_id, created_by, created_at
        ) VALUES (
          '${createId()}'::uuid, '${invoiceId}'::uuid, 10.00, 'CASH',
          (NOW() AT TIME ZONE 'Europe/Sofia')::date, NULL, '${userId}'::uuid, NOW()
        )
      `),
    ).rejects.toThrow(/check|23514|cash_collector/i);

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- CHECK non-cash collector
      db.prisma.$executeRawUnsafe(`
        INSERT INTO payments (
          id, invoice_id, amount, method, paid_at, collected_by_user_id, created_by, created_at
        ) VALUES (
          '${createId()}'::uuid, '${invoiceId}'::uuid, 10.00, 'CARD',
          (NOW() AT TIME ZONE 'Europe/Sofia')::date, '${fieldId}'::uuid, '${userId}'::uuid, NOW()
        )
      `),
    ).rejects.toThrow(/check|23514|cash_collector/i);
  });

  it("rejects future paid_at and handed_over_at", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- future paid_at
      db.prisma.$executeRawUnsafe(`
        INSERT INTO payments (
          id, invoice_id, amount, method, paid_at, collected_by_user_id, created_by, created_at
        ) VALUES (
          '${createId()}'::uuid, '${invoiceId}'::uuid, 10.00, 'BANK_TRANSFER',
          ((NOW() AT TIME ZONE 'Europe/Sofia')::date + 2), NULL, '${userId}'::uuid, NOW()
        )
      `),
    ).rejects.toThrow(/check|23514|paid_at/i);

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- future handover
      db.prisma.$executeRawUnsafe(`
        INSERT INTO cash_handovers (
          id, employee_id, amount, handed_over_at, received_by_user_id, created_by, created_at
        ) VALUES (
          '${createId()}'::uuid, '${fieldId}'::uuid, 10.00,
          ((NOW() AT TIME ZONE 'Europe/Sofia')::date + 2), '${userId}'::uuid, '${userId}'::uuid, NOW()
        )
      `),
    ).rejects.toThrow(/check|23514|handed_over/i);
  });

  it("due_date CHECK: DRAFT null / issued not null", async () => {
    const draftId = createId();
    // eslint-disable-next-line no-restricted-syntax -- draft without due_date ok
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO invoices (
        id, status, document_type, client_id, currency, net_amount, vat_amount, gross_amount,
        billing_month, created_by, created_at, updated_at
      ) VALUES (
        '${draftId}'::uuid, 'DRAFT', 'INVOICE', '${clientId}'::uuid, 'EUR', 0, 0, 0,
        DATE '2026-09-01', '${userId}'::uuid, NOW(), NOW()
      )
    `);

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- draft with due_date rejected
      db.prisma.$executeRawUnsafe(`
        UPDATE invoices SET due_date = DATE '2026-10-01' WHERE id = '${draftId}'::uuid
      `),
    ).rejects.toThrow(/check|23514|due_date/i);

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- issued without due_date rejected
      db.prisma.$executeRawUnsafe(`
        INSERT INTO invoices (
          id, number, status, document_type, client_id, issued_at, issued_by,
          client_legal_name, client_eik, client_vat_number,
          client_registered_address, client_legal_representative,
          currency, net_amount, vat_amount, gross_amount, billing_month,
          created_by, created_at, updated_at
        ) VALUES (
          '${createId()}'::uuid, '0000000301', 'ISSUED', 'INVOICE', '${clientId}'::uuid, NOW(), '${userId}'::uuid,
          'Client', '175074752', '', '', '',
          'EUR', 10.00, 2.00, 12.00, DATE '2026-09-01',
          '${userId}'::uuid, NOW(), NOW()
        )
      `),
    ).rejects.toThrow(/check|23514|due_date/i);
  });
});
