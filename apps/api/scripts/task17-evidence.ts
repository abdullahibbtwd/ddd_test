/**
 * Task 17 evidence helper (run with API DB + Mailpit available):
 * - overpay SQLSTATE → docs/evidence/task-17/overpay.json
 * - UPDATE/DELETE rejects → docs/evidence/task-17/immutability.json
 * - outstanding report sample → docs/evidence/task-17/outstanding.json
 * - negative cash ledger → docs/evidence/task-17/cash-ledger.json
 * - Mailpit reminder body (if reachable) → docs/evidence/task-17/reminder-mail.json
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task17-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { InvoiceStatus, DocumentType } from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

function extractSqlstate(message: string | undefined, fallback: string): string {
  const m = message?.match(/Code:\s*`([0-9A-Z]{5})`/);
  return m?.[1] ?? fallback;
}

async function probeSql(
  prisma: PrismaClient,
  label: string,
  sql: string,
): Promise<{ label: string; ok: boolean; sqlstate?: string; message?: string }> {
  try {
    // eslint-disable-next-line no-restricted-syntax -- evidence probe
    await prisma.$executeRawUnsafe(sql);
    return { label, ok: true };
  } catch (e) {
    const err = e as { code?: string; meta?: { code?: string }; message?: string };
    const fallback = err.meta?.code ?? err.code ?? "unknown";
    const sqlstate = extractSqlstate(err.message, fallback);
    return { label, ok: false, sqlstate, message: err.message?.slice(0, 280) };
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const outDir = resolve(__dirname, "../../../docs/evidence/task-17");
  mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        status: InvoiceStatus.ISSUED,
        documentType: DocumentType.INVOICE,
        number: { not: null },
      },
      orderBy: { number: "desc" },
      include: { payments: true },
    });
    if (!invoice) {
      console.error("No issued invoice for evidence");
      process.exit(1);
    }

    const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remain = Math.max(0.01, Number(invoice.grossAmount) - paid + 100);

    const overpay = await probeSql(
      prisma,
      "overpay",
      `INSERT INTO payments (
         id, invoice_id, amount, method, paid_at, created_by, created_at
       ) VALUES (
         gen_random_uuid(), '${invoice.id}'::uuid, ${remain.toFixed(2)},
         'CARD', CURRENT_DATE, '${invoice.createdById}'::uuid, NOW()
       )`,
    );
    writeFileSync(
      resolve(outDir, "overpay.json"),
      JSON.stringify({ invoiceId: invoice.id, remainAttempted: remain.toFixed(2), ...overpay }, null, 2),
    );

    const immutability = {
      paymentUpdate: await probeSql(
        prisma,
        "payment UPDATE",
        `UPDATE payments SET notes = 'x' WHERE invoice_id = '${invoice.id}'::uuid`,
      ),
      paymentDelete: await probeSql(
        prisma,
        "payment DELETE",
        `DELETE FROM payments WHERE invoice_id = '${invoice.id}'::uuid AND false`,
      ),
      handoverUpdate: await probeSql(
        prisma,
        "handover UPDATE",
        `UPDATE cash_handovers SET notes = 'x' WHERE false`,
      ),
    };
    // Force a real delete attempt if a payment exists
    const anyPay = await prisma.payment.findFirst({ where: { invoiceId: invoice.id } });
    if (anyPay) {
      immutability.paymentDelete = await probeSql(
        prisma,
        "payment DELETE",
        `DELETE FROM payments WHERE id = '${anyPay.id}'::uuid`,
      );
    }
    let anyHandover = await prisma.cashHandover.findFirst();
    if (!anyHandover) {
      const field = await prisma.user.findFirst({ where: { role: "FIELD" } });
      const office = await prisma.user.findFirst({
        where: { role: { in: ["ADMIN", "OFFICE"] } },
      });
      if (field && office) {
        // eslint-disable-next-line no-restricted-syntax -- evidence fixture
        await prisma.$executeRawUnsafe(`
          INSERT INTO cash_handovers (
            id, employee_id, amount, handed_over_at, received_by_user_id, notes, created_at, created_by
          ) VALUES (
            gen_random_uuid(), '${field.id}'::uuid, 1.00, CURRENT_DATE,
            '${office.id}'::uuid, '__evidence_handover__', NOW(), '${office.id}'::uuid
          )
        `);
        anyHandover = await prisma.cashHandover.findFirst({
          where: { notes: "__evidence_handover__" },
        });
      }
    }
    if (anyHandover) {
      immutability.handoverUpdate = await probeSql(
        prisma,
        "handover UPDATE",
        `UPDATE cash_handovers SET notes = 'mut' WHERE id = '${anyHandover.id}'::uuid`,
      );
    }
    writeFileSync(resolve(outDir, "immutability.json"), JSON.stringify(immutability, null, 2));

    // Outstanding aggregate sample (same shape as API SQL)
    // eslint-disable-next-line no-restricted-syntax -- evidence aggregate
    const outstandingRows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        number: string | null;
        gross_amount: string;
        paid_sum: string;
        outstanding: string;
      }>
    >(`
      SELECT i.id::text, i.number,
             i.gross_amount::text,
             COALESCE(SUM(p.amount), 0)::text AS paid_sum,
             (i.gross_amount - COALESCE(SUM(p.amount), 0))::text AS outstanding
      FROM invoices i
      LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i.status = 'ISSUED' AND i.document_type = 'INVOICE'
      GROUP BY i.id
      HAVING i.gross_amount - COALESCE(SUM(p.amount), 0) > 0
      ORDER BY i.number ASC
      LIMIT 10
    `);
    writeFileSync(
      resolve(outDir, "outstanding.json"),
      JSON.stringify({ count: outstandingRows.length, items: outstandingRows }, null, 2),
    );

    // Cash ledger with possible negative outstanding
    // eslint-disable-next-line no-restricted-syntax -- evidence ledger
    const ledger = await prisma.$queryRawUnsafe<
      Array<{
        employee_id: string;
        collected: string;
        handed: string;
        outstanding: string;
      }>
    >(`
      SELECT
        u.id::text AS employee_id,
        COALESCE(c.collected, 0)::text AS collected,
        COALESCE(h.handed, 0)::text AS handed,
        (COALESCE(c.collected, 0) - COALESCE(h.handed, 0))::text AS outstanding
      FROM users u
      LEFT JOIN (
        SELECT collected_by_user_id AS uid, SUM(amount) AS collected
        FROM payments WHERE method = 'CASH' AND collected_by_user_id IS NOT NULL
        GROUP BY collected_by_user_id
      ) c ON c.uid = u.id
      LEFT JOIN (
        SELECT employee_id AS uid, SUM(amount) AS handed
        FROM cash_handovers GROUP BY employee_id
      ) h ON h.uid = u.id
      WHERE c.collected IS NOT NULL OR h.handed IS NOT NULL
      ORDER BY outstanding ASC
      LIMIT 20
    `);
    writeFileSync(
      resolve(outDir, "cash-ledger.json"),
      JSON.stringify(
        {
          negativePresent: ledger.some((r) => Number(r.outstanding) < 0),
          employees: ledger,
        },
        null,
        2,
      ),
    );

    // Mailpit reminder probe (best-effort)
    let reminderMail: Record<string, unknown> = { reachable: false };
    try {
      const res = await fetch("http://127.0.0.1:8025/api/v1/messages");
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{ Subject?: string; Snippet?: string; ID?: string }>;
        };
        const hit = (data.messages ?? []).find((m) =>
          (m.Subject ?? "").includes("Напомняне"),
        );
        reminderMail = {
          reachable: true,
          found: Boolean(hit),
          subject: hit?.Subject ?? null,
          snippet: hit?.Snippet ?? null,
          note: hit
            ? undefined
            : "No reminder subject yet — send via API/worker then re-run",
        };
      }
    } catch (e) {
      reminderMail = {
        reachable: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    writeFileSync(resolve(outDir, "reminder-mail.json"), JSON.stringify(reminderMail, null, 2));

    console.log("Wrote Task 17 evidence to", outDir);
    console.log("overpay sqlstate:", overpay.sqlstate);
    console.log(
      "immutability paymentUpdate:",
      immutability.paymentUpdate.sqlstate,
      "paymentDelete:",
      immutability.paymentDelete.sqlstate,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
