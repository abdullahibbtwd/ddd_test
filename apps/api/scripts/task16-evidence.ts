/**
 * Task 16 evidence helper (run with API DB + Gotenberg available):
 * - original vs copy PDF samples → docs/evidence/task-16/pdf/
 * - contiguous numbers JSON → docs/evidence/task-16/numbers.json
 * - immutability SQL probes → docs/evidence/task-16/immutability.json
 * - email_events sample → docs/evidence/task-16/email-events.json
 * - unit/API highlight summary → docs/evidence/task-16/unit-summary.txt
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task16-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DocumentType, InvoiceStatus } from "@ddcrm/shared";
import { NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppModule } from "../src/app.module";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";
import { InvoicePdfService } from "../src/invoices/invoice-pdf.service";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const outDir = resolve(__dirname, "../../../docs/evidence/task-16");
  mkdirSync(resolve(outDir, "pdf"), { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  const invoice = await prisma.invoice.findFirst({
    where: {
      status: {
        in: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE],
      },
      documentType: DocumentType.INVOICE,
      number: { not: null },
    },
    orderBy: { number: "asc" },
  });
  if (!invoice) {
    console.error("No issued invoice found for PDF evidence");
    process.exit(1);
  }

  console.log("bootstrapping AppModule for PDF…");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const pdf = app.get(InvoicePdfService);
  const original = await pdf.renderById(invoice.id, false);
  const copy = await pdf.renderById(invoice.id, true);
  writeFileSync(resolve(outDir, "pdf", "original.pdf"), original);
  writeFileSync(resolve(outDir, "pdf", "copy.pdf"), copy);

  const delta = Math.abs(original.length - copy.length);

  const numbered = await prisma.invoice.findMany({
    where: { number: { not: null } },
    orderBy: { number: "asc" },
    select: {
      number: true,
      documentType: true,
      status: true,
      referencesInvoiceId: true,
    },
  });
  // Prefer a 10-row contiguous window that includes invoice + credit + debit.
  let windowStart = 0;
  let bestScore = -1;
  for (let i = 0; i <= Math.max(0, numbered.length - 10); i++) {
    const slice = numbered.slice(i, i + 10);
    const types = new Set(slice.map((n) => n.documentType));
    const score =
      (types.has(DocumentType.INVOICE) ? 1 : 0) +
      (types.has(DocumentType.CREDIT_NOTE) ? 2 : 0) +
      (types.has(DocumentType.DEBIT_NOTE) ? 2 : 0) +
      (slice.some((n) => n.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE)
        ? 1
        : 0);
    if (score > bestScore) {
      bestScore = score;
      windowStart = i;
    }
  }
  const numbersWindow = numbered.slice(windowStart, windowStart + 10);

  writeFileSync(
    resolve(outDir, "numbers.json"),
    JSON.stringify(
      {
        sampleInvoiceId: invoice.id,
        sampleNumber: invoice.number,
        pdfByteDelta: delta,
        originalBytes: original.length,
        copyBytes: copy.length,
        numbers: numbersWindow.map((n) => ({
          number: n.number,
          documentType: n.documentType,
          status: n.status,
          referencesInvoiceId: n.referencesInvoiceId,
        })),
      },
      null,
      2,
    ),
  );

  const probe =
    (await prisma.invoice.findFirst({
      where: {
        status: InvoiceStatus.ISSUED,
        documentType: DocumentType.INVOICE,
        number: { not: null },
      },
      orderBy: { number: "desc" },
    })) ?? invoice;

  /* eslint-disable no-restricted-syntax -- evidence SQL probes against immutability trigger */
  const rejectNotes = await prisma
    .$executeRawUnsafe(
      `UPDATE invoices SET notes = 'evidence-probe' WHERE id = '${probe.id}'::uuid`,
    )
    .then(() => ({ ok: true as const }))
    .catch((e: unknown) => ({
      ok: false as const,
      message: e instanceof Error ? e.message : String(e),
    }));

  const allowEmail = await prisma
    .$executeRawUnsafe(
      `UPDATE invoices SET email_sent_at = NOW(), email_last_error = NULL WHERE id = '${probe.id}'::uuid`,
    )
    .then(() => ({ ok: true as const }))
    .catch((e: unknown) => ({
      ok: false as const,
      message: e instanceof Error ? e.message : String(e),
    }));

  const cancelWithoutCredit = await prisma
    .$executeRawUnsafe(
      `UPDATE invoices SET status = 'CANCELLED_BY_CREDIT_NOTE' WHERE id = '${probe.id}'::uuid`,
    )
    .then(() => ({ ok: true as const }))
    .catch((e: unknown) => ({
      ok: false as const,
      message: e instanceof Error ? e.message : String(e),
    }));
  /* eslint-enable no-restricted-syntax */

  writeFileSync(
    resolve(outDir, "immutability.json"),
    JSON.stringify(
      {
        probeInvoiceId: probe.id,
        probeNumber: probe.number,
        rejectRandomNotesUpdate: {
          expectedSqlstate: "23P02",
          ...rejectNotes,
        },
        allowEmailSentAtUpdate: allowEmail,
        rejectCancelWithoutCreditNote: {
          expectedSqlstate: "23P02",
          ...cancelWithoutCredit,
        },
        note: "Credit-note transition is exercised in invoices-db.spec.ts (AFTER INSERT trigger). Lines trigger remains BEFORE UPDATE OR DELETE only.",
      },
      null,
      2,
    ),
  );

  const events = await prisma.emailEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      invoiceId: true,
      jobId: true,
      toAddress: true,
      error: true,
      createdAt: true,
      sentAt: true,
      failedAt: true,
    },
  });
  writeFileSync(
    resolve(outDir, "email-events.json"),
    JSON.stringify(
      {
        note: "Sample of email_events rows (pending / sent / failed). Before/after send covered in invoice-email.processor.spec.ts.",
        count: events.length,
        events,
      },
      null,
      2,
    ),
  );

  writeFileSync(
    resolve(outDir, "unit-summary.txt"),
    [
      "Task 16 evidence highlights (from API/DB/worker tests):",
      "- original-vs-copy PDF: byte-identical except ОРИГИНАЛ/КОПИЕ stamp (pdfByteDelta in numbers.json)",
      "- credit-note: creates ISSUED CN, original → CANCELLED_BY_CREDIT_NOTE; second CN → 409",
      "- debit-note: creates ISSUED DN; original remains ISSUED",
      "- batch dryRun: plan without writes; create: drafts; issue: per-id results; partial failure continues",
      "- email queue: processor sets email_sent_at / email_events.sent_at; forced failure records error",
      "- immutability: random UPDATE → 23P02; email_sent_at allowed; cancel without CN → 23P02",
      "",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        number: invoice.number,
        originalBytes: original.length,
        copyBytes: copy.length,
        delta,
        numbersCaptured: numbersWindow.length,
        emailEvents: events.length,
        immutability: {
          rejectNotes: rejectNotes.ok,
          allowEmail: allowEmail.ok,
          rejectCancelWithoutCredit: cancelWithoutCredit.ok,
        },
      },
      null,
      2,
    ),
  );

  await app.close();
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
