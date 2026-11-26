import { Inject, Injectable } from "@nestjs/common";
import {
  DocumentType,
  ErrorCode,
  InvoiceStatus,
  vatBreakdown,
} from "@ddcrm/shared";
import { AppException } from "../common/errors/app.exception";
import { SUPPLIER } from "../config/supplier";
import { PdfService } from "../pdf/pdf.service";
import { PrismaService } from "../prisma/prisma.service";

export type InvoicePdfStamp = "ОРИГИНАЛ" | "КОПИЕ";

const LINES_PER_PAGE = 20;

type PdfInvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  documentType: string;
  issuedAt: Date | null;
  clientLegalName: string | null;
  clientEik: string | null;
  clientVatNumber: string | null;
  clientRegisteredAddress: string | null;
  clientLegalRepresentative: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  currency: string;
  netAmount: { toString(): string };
  vatAmount: { toString(): string };
  grossAmount: { toString(): string };
  creditNoteReason: string | null;
  referencesInvoiceId: string | null;
  lines: Array<{
    lineNo: number;
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    vatRate: { toString(): string };
    lineTotal: { toString(): string };
    vatAmount: { toString(): string };
  }>;
};

@Injectable()
export class InvoicePdfService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PdfService) private readonly pdf: PdfService,
  ) {}

  async renderById(invoiceId: string, copy: boolean): Promise<Buffer> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (!row) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    if (
      row.status !== InvoiceStatus.ISSUED &&
      row.status !== InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
    ) {
      throw new AppException(ErrorCode.NOT_FOUND, "PDF available only for issued documents");
    }
    return this.renderFromRow(row as unknown as PdfInvoiceRow, copy ? "КОПИЕ" : "ОРИГИНАЛ");
  }

  async renderFromRow(row: PdfInvoiceRow, stamp: InvoicePdfStamp): Promise<Buffer> {
    try {
      const html = this.buildHtml(row, stamp);
      return await this.pdf.fromHtml(html);
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(ErrorCode.PDF_RENDER_FAILED, "PDF render failed", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private documentTitle(documentType: string): string {
    switch (documentType) {
      case DocumentType.CREDIT_NOTE:
        return "Кредитно известие";
      case DocumentType.DEBIT_NOTE:
        return "Дебитно известие";
      default:
        return "Фактура";
    }
  }

  private formatMoney(value: { toString(): string } | string): string {
    const n = Number(value.toString());
    return n.toFixed(2);
  }

  private formatDate(value: Date | null): string {
    if (!value) return "—";
    return value.toISOString().slice(0, 10);
  }

  private buildHtml(row: PdfInvoiceRow, stamp: InvoicePdfStamp): string {
    const lines = row.lines;
    const pages: typeof lines[] = [];
    if (lines.length === 0) {
      pages.push([]);
    } else {
      for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
        pages.push(lines.slice(i, i + LINES_PER_PAGE));
      }
    }

    const breakdown = vatBreakdown(
      lines.map((l) => ({
        amount: this.formatMoney(l.lineTotal),
        vatRate: this.formatMoney(l.vatRate),
      })),
    );

    const title = this.documentTitle(row.documentType);
    const pageBlocks = pages
      .map((pageLines, pageIndex) => {
        const isLast = pageIndex === pages.length - 1;
        const lineRows = pageLines
          .map(
            (line) => `<tr>
              <td>${line.lineNo}</td>
              <td>${escapeHtml(line.description)}</td>
              <td class="amount">${this.formatMoney(line.quantity)}</td>
              <td class="amount">${this.formatMoney(line.unitPrice)}</td>
              <td class="amount">${this.formatMoney(line.vatRate)}</td>
              <td class="amount">${this.formatMoney(line.lineTotal)}</td>
              <td class="amount">${this.formatMoney(line.vatAmount)}</td>
            </tr>`,
          )
          .join("");

        const totalsBlock = isLast
          ? `
          <table>
            <tr><td>Нето</td><td class="amount">${this.formatMoney(row.netAmount)} ${row.currency}</td></tr>
            <tr><td>ДДС</td><td class="amount">${this.formatMoney(row.vatAmount)} ${row.currency}</td></tr>
            <tr><td><strong>Общо</strong></td><td class="amount"><strong>${this.formatMoney(row.grossAmount)} ${row.currency}</strong></td></tr>
          </table>
          <h3>Разбивка по ДДС</h3>
          <table>
            <thead><tr><th>Ставка</th><th class="amount">Нето</th><th class="amount">ДДС</th></tr></thead>
            <tbody>
              ${breakdown
                .map(
                  (g) => `<tr>
                    <td>${g.vatRate}%</td>
                    <td class="amount">${g.net}</td>
                    <td class="amount">${g.vat}</td>
                  </tr>`,
                )
                .join("")}
            </tbody>
          </table>
          ${
            row.creditNoteReason
              ? `<p><strong>Основание:</strong> ${escapeHtml(row.creditNoteReason)}</p>`
              : ""
          }
          `
          : `<p class="muted">Продължава на следваща страница…</p>`;

        return `
        <section class="invoice-page" style="${pageIndex > 0 ? "page-break-before: always;" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
            <div>
              <h1>${escapeHtml(title)} № <span class="mono">${escapeHtml(row.number ?? "")}</span></h1>
              <p class="muted">Дата: ${this.formatDate(row.issuedAt)}</p>
              ${
                row.referencesInvoiceId
                  ? `<p class="muted">Към документ: ${escapeHtml(row.referencesInvoiceId)}</p>`
                  : ""
              }
            </div>
            <div class="stamp mono" style="font-size:18px;font-weight:600;border:2px solid #111827;padding:8px 16px;letter-spacing:0.08em;">
              ${stamp}
            </div>
          </div>

          <div style="display:flex;gap:32px;margin-top:16px;">
            <div style="flex:1;">
              <h3>Доставчик</h3>
              <p><strong>${escapeHtml(SUPPLIER.name)}</strong></p>
              <p>ЕИК: <span class="mono">${escapeHtml(SUPPLIER.eik)}</span></p>
              <p>ДДС №: <span class="mono">${escapeHtml(SUPPLIER.vatNumber)}</span></p>
              <p>${escapeHtml(SUPPLIER.address)}</p>
              <p>IBAN: <span class="mono">${escapeHtml(SUPPLIER.iban)}</span></p>
              <p>Банка: ${escapeHtml(SUPPLIER.bank)}</p>
            </div>
            <div style="flex:1;">
              <h3>Получател</h3>
              <p><strong>${escapeHtml(row.clientLegalName ?? "")}</strong></p>
              <p>ЕИК: <span class="mono">${escapeHtml(row.clientEik ?? "")}</span></p>
              <p>ДДС №: <span class="mono">${escapeHtml(row.clientVatNumber ?? "")}</span></p>
              <p>${escapeHtml(row.clientRegisteredAddress ?? "")}</p>
              <p>МОЛ: ${escapeHtml(row.clientLegalRepresentative ?? "")}</p>
              ${
                row.clientEmail
                  ? `<p>Имейл: ${escapeHtml(row.clientEmail)}</p>`
                  : ""
              }
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Описание</th>
                <th class="amount">Кол.</th>
                <th class="amount">Ед. цена</th>
                <th class="amount">ДДС %</th>
                <th class="amount">Нето</th>
                <th class="amount">ДДС</th>
              </tr>
            </thead>
            <tbody>${lineRows}</tbody>
          </table>

          ${totalsBlock}
        </section>`;
      })
      .join("\n");

    return this.pdf.renderTemplate(pageBlocks);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
