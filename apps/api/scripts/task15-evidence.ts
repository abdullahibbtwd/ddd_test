/**
 * Task 15 evidence: concurrency counter SQL, issued immutability + zero audit,
 * JSON dump of 10 issued invoice numbers.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task15-evidence.ts
 *
 * Writes docs/evidence/task-15/*.json (and prints SQL snippets for the report).
 *
 * Playwright screenshots (when e2e screenshot spec is run):
 *   docs/evidence/task-15/screenshots/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLineAmounts,
  createId,
  CURRENCY,
  formatInvoiceNumber,
  InvoiceStatus,
  Role,
} from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  const outDir = resolve(process.cwd(), "../../docs/evidence/task-15");
  mkdirSync(outDir, { recursive: true });

  console.log("=== Task 15 evidence ===\n");

  console.log("-- Concurrency counter (issue path locks the singleton row):");
  console.log(`SELECT id, next_value FROM invoice_counters WHERE id = 'default' FOR UPDATE;`);
  console.log(`UPDATE invoice_counters SET next_value = next_value + 1 WHERE id = 'default';\n`);

  try {
    const counter = await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: "default" } });
    writeFileSync(
      resolve(outDir, "counter.json"),
      JSON.stringify({ id: counter.id, nextValue: counter.nextValue }, null, 2),
    );
    console.log(`counter next_value = ${counter.nextValue}\n`);

    const issued = await prisma.invoice.findMany({
      where: { status: InvoiceStatus.ISSUED, number: { not: null } },
      orderBy: { number: "asc" },
      take: 10,
      select: {
        id: true,
        number: true,
        status: true,
        grossAmount: true,
        issuedAt: true,
        clientLegalName: true,
      },
    });
    writeFileSync(
      resolve(outDir, "issued-10.json"),
      JSON.stringify(
        issued.map((row) => ({
          id: row.id,
          number: row.number,
          status: row.status,
          grossAmount: String(row.grossAmount),
          issuedAt: row.issuedAt?.toISOString() ?? null,
          clientLegalName: row.clientLegalName,
        })),
        null,
        2,
      ),
    );
    console.log(`wrote ${issued.length} issued numbers → docs/evidence/task-15/issued-10.json`);

    // Immutability: attempt UPDATE on an issued row → 23P02, zero new audit UPDATE rows.
    let target = issued[0];
    if (!target) {
      const client = await prisma.client.findFirst({ where: { isActive: true } });
      const user = await prisma.user.findFirst({
        where: { isActive: true, role: { in: [Role.ADMIN, Role.OFFICE] } },
      });
      if (client && user) {
        const id = createId();
        const line = {
          description: "Evidence line",
          quantity: "1.000",
          unitPrice: "10.00",
          vatRate: "20.00",
        };
        const amounts = buildLineAmounts(line);
        await prisma.invoice.create({
          data: {
            id,
            number: formatInvoiceNumber(Math.max(counter.nextValue, 9_000_000)),
            status: InvoiceStatus.ISSUED,
            clientId: client.id,
            issuedAt: new Date(),
            issuedById: user.id,
            clientLegalName: client.name,
            clientEik: client.eik ?? "",
            clientVatNumber: client.vatNumber ?? "",
            clientRegisteredAddress: client.registeredAddress ?? "",
            clientLegalRepresentative: client.legalRepresentative ?? "",
            currency: CURRENCY,
            netAmount: amounts.lineTotal,
            vatAmount: amounts.vatAmount,
            grossAmount: (Number(amounts.lineTotal) + Number(amounts.vatAmount)).toFixed(2),
            notes: "__task15_evidence__",
            createdById: user.id,
          },
        });
        await prisma.invoiceLine.create({
          data: {
            id: createId(),
            invoiceId: id,
            lineNo: 1,
            ...line,
            lineTotal: amounts.lineTotal,
            vatAmount: amounts.vatAmount,
          },
        });
        target = {
          id,
          number: formatInvoiceNumber(Math.max(counter.nextValue, 9_000_000)),
          status: InvoiceStatus.ISSUED,
          grossAmount: (Number(amounts.lineTotal) + Number(amounts.vatAmount)).toFixed(
            2,
          ) as unknown as (typeof issued)[0]["grossAmount"],
          issuedAt: new Date(),
          clientLegalName: client.name,
        };
      }
    }

    if (target) {
      const beforeAudit = await prisma.auditLog.count({
        where: { entityType: "invoices", entityId: target.id, action: "UPDATE" },
      });
      let sqlstate: string | null = null;
      try {
        // eslint-disable-next-line no-restricted-syntax -- evidence: prove BEFORE trigger
        await prisma.$executeRawUnsafe(
          `UPDATE invoices SET notes = 'hack-evidence' WHERE id = '${target.id}'::uuid`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sqlstate = /23P02/.test(msg) ? "23P02" : msg.slice(0, 200);
      }
      const afterAudit = await prisma.auditLog.count({
        where: { entityType: "invoices", entityId: target.id, action: "UPDATE" },
      });
      const immutability = {
        invoiceId: target.id,
        number: target.number,
        sqlstate,
        auditUpdateRowsBefore: beforeAudit,
        auditUpdateRowsAfter: afterAudit,
        zeroNewAuditRows: afterAudit === beforeAudit,
      };
      writeFileSync(resolve(outDir, "immutability.json"), JSON.stringify(immutability, null, 2));
      console.log("\n-- Immutability (BEFORE trigger, SQLSTATE 23P02, zero audit):");
      console.log(JSON.stringify(immutability, null, 2));
    }

    console.log("\nScreenshots (from Playwright invoices-screenshots.spec.ts):");
    console.log("  docs/evidence/task-15/screenshots/");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
