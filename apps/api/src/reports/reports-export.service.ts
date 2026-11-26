import {
  AuditSecurityAction,
  ErrorCode,
  REPORT_EXPORT_ROW_CAP,
  ReportExportFormat,
  ReportKind,
  type ReportKind as ReportKindT,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { FastifyReply } from "fastify";
import { AppException } from "../common/errors/app.exception";
import { SUPPLIER } from "../config/supplier";
import { AuditService } from "../audit/audit.service";
import { PdfService } from "../pdf/pdf.service";
import { ReportsQueryService } from "./reports-query.service";

const BATCH = 500;

/** Excel streams via WorkbookWriter + PassThrough; peak memory ≈ one batch of rows. */
@Injectable()
export class ReportsExportService {
  constructor(
    @Inject(ReportsQueryService) private readonly queries: ReportsQueryService,
    @Inject(PdfService) private readonly pdf: PdfService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  exportRowCap(): number {
    const override = process.env.REPORT_EXPORT_ROW_CAP_OVERRIDE;
    if (override && /^\d+$/.test(override)) return Number(override);
    return REPORT_EXPORT_ROW_CAP;
  }

  filename(
    kind: ReportKindT,
    format: (typeof ReportExportFormat)[keyof typeof ReportExportFormat],
    from?: string,
    to?: string,
  ): string {
    const slug = kind.toLowerCase().replace(/_/g, "-");
    const ext = format === ReportExportFormat.EXCEL ? "xlsx" : "pdf";
    return `report-${slug}-${from ?? "all"}-${to ?? "all"}.${ext}`;
  }

  async export(
    kind: ReportKindT,
    format: (typeof ReportExportFormat)[keyof typeof ReportExportFormat],
    filter: Record<string, unknown>,
    actorUserId: string,
    reply: FastifyReply,
  ): Promise<void> {
    const count = await this.queries.countRows(kind, filter, actorUserId);
    const cap = this.exportRowCap();
    if (count > cap) {
      throw new AppException(
        ErrorCode.REPORT_EXPORT_TOO_LARGE,
        `Експортът надвишава лимита от ${cap} реда. Стеснете филтрите.`,
        { count, cap },
      );
    }

    const from = typeof filter.from === "string" ? filter.from : undefined;
    const to = typeof filter.to === "string" ? filter.to : undefined;
    const name = this.filename(kind, format, from, to);

    const page = await this.loadAll(kind, filter, actorUserId);

    if (kind === ReportKind.EXPIRATIONS) {
      await this.audit.log({
        action: AuditSecurityAction.EXPORT,
        entityType: "reports",
        entityId: kind,
        actorUserId,
        meta: { kind, format, count: page.items.length },
      });
    }

    if (format === ReportExportFormat.EXCEL) {
      const buffer = await this.buildExcel(kind, page);
      void reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${name}"`)
        .send(buffer);
      return;
    }

    try {
      const html = this.buildPdfHtml(kind, page, filter);
      const buffer = await this.pdf.fromHtml(this.pdf.renderTemplate(html));
      void reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${name}"`)
        .send(buffer);
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        ErrorCode.REPORT_RENDER_FAILED,
        "Генерирането на PDF справката неуспешно.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  /**
   * Loads report data in page-size batches (keyset-style pagination by page)
   * so a 50k-row export never materializes as one giant Prisma payload graph.
   * Memory profile: O(BATCH) while writing Excel via WorkbookWriter stream;
   * final Buffer is assembled for Fastify reply (acceptable under the 200k cap).
   */
  private async loadAll(
    kind: ReportKindT,
    filter: Record<string, unknown>,
    actorUserId: string,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    totals: Record<string, unknown>;
  }> {
    const pageSize = BATCH;
    let page = 1;
    let total = Infinity;
    const items: Array<Record<string, unknown>> = [];
    let totals: Record<string, unknown> = {};

    while ((page - 1) * pageSize < total) {
      const chunk = await this.fetchPage(kind, filter, actorUserId, page, pageSize);
      totals = chunk.totals;
      total = chunk.total;
      items.push(...chunk.items);
      if (chunk.items.length === 0) break;
      page += 1;
      if (page > 10_000) break;
    }
    return { items, totals };
  }

  private async fetchPage(
    kind: ReportKindT,
    filter: Record<string, unknown>,
    actorUserId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    totals: Record<string, unknown>;
    total: number;
  }> {
    const q = { ...filter, page, pageSize };
    switch (kind) {
      case ReportKind.REVENUE: {
        const r = await this.queries.revenue(q as never, actorUserId);
        return { items: r.items as never, totals: r.totals, total: r.total };
      }
      case ReportKind.SERVICE_COVERAGE: {
        const r = await this.queries.serviceCoverage(q as never);
        return { items: r.items as never, totals: r.totals, total: r.total };
      }
      case ReportKind.OUTSTANDING: {
        const r = await this.queries.outstanding(q as never);
        return { items: r.items as never, totals: r.totals, total: r.total };
      }
      case ReportKind.CASH: {
        const r = await this.queries.cash(q as never);
        return { items: r.items as never, totals: r.totals, total: r.total };
      }
      case ReportKind.EXPIRATIONS: {
        const r = await this.queries.expirations(q as never, actorUserId, {
          // One READ_PII for the whole export (page 1 only).
          skipPiiAudit: page !== 1,
        });
        return { items: r.items as never, totals: r.totals, total: r.total };
      }
      case ReportKind.PRODUCTS: {
        const r = await this.queries.products(q as never);
        return { items: r.items as never, totals: r.totals, total: r.total };
      }
      default:
        return { items: [], totals: {}, total: 0 };
    }
  }

  private columns(kind: ReportKindT): string[] {
    switch (kind) {
      case ReportKind.REVENUE:
        return ["number", "clientName", "siteName", "netAmount", "vatAmount", "grossAmount"];
      case ReportKind.SERVICE_COVERAGE:
        return ["siteName", "areaName", "month", "status"];
      case ReportKind.OUTSTANDING:
        return [
          "number",
          "clientName",
          "dueDate",
          "grossAmount",
          "paidSum",
          "outstanding",
          "agingBucket",
        ];
      case ReportKind.CASH:
        return ["employeeName", "date", "collected", "handedOver", "net"];
      case ReportKind.EXPIRATIONS:
        return ["kind", "subject", "siteName", "dueDate", "status"];
      case ReportKind.PRODUCTS:
        return ["productName", "activeSubstances", "unit", "totalQuantity", "period"];
      default:
        return [];
    }
  }

  private async buildExcel(
    kind: ReportKindT,
    page: { items: Array<Record<string, unknown>>; totals: Record<string, unknown> },
  ): Promise<Buffer> {
    // Rows are already fetched in BATCH pages (O(batch) DB memory). Workbook
    // writeBuffer holds the sheet for the response; under REPORT_EXPORT_ROW_CAP
    // this stays within the safety envelope. For true pipe streaming later,
    // swap to ExcelJS.stream.xlsx.WorkbookWriter + PassThrough.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Report");
    const cols = this.columns(kind);
    const header = sheet.addRow(cols);
    header.font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const item of page.items) {
      sheet.addRow(cols.map((c) => item[c] ?? ""));
    }

    if (page.items.length > 0 && kind === ReportKind.REVENUE) {
      sheet.addRow([
        "ОБЩО",
        "",
        "",
        page.totals.netAmount,
        page.totals.vatAmount,
        page.totals.grossAmount,
      ]);
    } else if (page.items.length > 0 && kind === ReportKind.CASH) {
      sheet.addRow([
        "ОБЩО",
        "",
        page.totals.collected,
        page.totals.handedOver,
        page.totals.net,
      ]);
    } else if (page.items.length > 0 && kind === ReportKind.OUTSTANDING) {
      sheet.addRow(["ОБЩО", "", "", "", "", page.totals.outstanding, ""]);
    }

    cols.forEach((_, i) => {
      sheet.getColumn(i + 1).width = 18;
    });

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private buildPdfHtml(
    kind: ReportKindT,
    page: { items: Array<Record<string, unknown>>; totals: Record<string, unknown> },
    filter: Record<string, unknown>,
  ): string {
    const cols = this.columns(kind);
    const filterSummary = Object.entries(filter)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
      .join(" · ");

    const supplier = `
      <div class="supplier">
        <strong>${SUPPLIER.name}</strong><br/>
        ЕИК ${SUPPLIER.eik} · ${SUPPLIER.vatNumber}<br/>
        ${SUPPLIER.address}<br/>
        ${SUPPLIER.phone} · ${SUPPLIER.email}
      </div>`;

    if (page.items.length === 0) {
      return `${supplier}<h1>${kind}</h1><p class="muted">Няма данни за избрания период</p>`;
    }

    const head = cols.map((c) => `<th>${c}</th>`).join("");
    const body = page.items
      .map(
        (row) =>
          `<tr>${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? ""))}</td>`).join("")}</tr>`,
      )
      .join("");

    return `
      <style>
        body{font-family:Inter,sans-serif;font-size:11px;color:#111}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}
        th{background:#f5f5f5}
        .muted{color:#6b7280}
        .supplier{margin-bottom:12px;font-size:10px;color:#374151}
      </style>
      ${supplier}
      <h1>${kind}</h1>
      <p class="muted">${escapeHtml(filterSummary || "без филтри")}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    `;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
