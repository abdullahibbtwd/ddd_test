import {
  defineAbilityFor,
  ErrorCode,
  groupRecommendationsForReport,
  ServiceType,
  type VisitProductSnapshotEntry,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { accessibleVisitWhere } from "../auth/accessible-where";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import { SUPPLIER } from "../config/supplier";
import { PdfService } from "../pdf/pdf.service";
import { PrismaService } from "../prisma/prisma.service";

const TREATMENT_LABELS: Record<string, string> = {
  [ServiceType.INSECT_CONTROL]: "Дезинсекция",
  [ServiceType.RODENT_CONTROL]: "Дератизация",
  [ServiceType.DISINFECTION]: "Дезинфекция",
  [ServiceType.OTHER]: "Друго",
};

const FORMULATION_LABELS: Record<string, string> = {
  LIQUID: "Течност",
  POWDER: "Прах",
  GEL: "Гел",
  BAIT: "Примамка",
  TRAP: "Капан",
  AEROSOL: "Аерозол",
  OTHER: "Друго",
};

const UNIT_LABELS: Record<string, string> = {
  G: "г",
  KG: "кг",
  ML: "мл",
  L: "л",
  PIECE: "бр.",
};

const STATUS_LABELS: Record<string, string> = {
  OK: "ОК",
  ACTIVITY: "Активност",
  DAMAGED: "Повредена",
  MISSING: "Липсва",
  OTHER: "Друго",
};

/** ASCII-only slug for Content-Disposition (Node rejects non-ASCII header bytes). */
function slugify(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return ascii || "report";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@Injectable()
export class ServiceReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PdfService) private readonly pdf: PdfService,
  ) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  async render(
    user: AuthRequestUser,
    visitId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const ability = this.abilityFor(user);
    if (!ability.can("read", "Visit") && !ability.can("manage", "all")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Cannot read service report");
    }

    const visit = await this.prisma.visit.findFirst({
      where: { AND: [{ id: visitId }, accessibleVisitWhere(ability)] },
      include: {
        site: {
          include: {
            client: { select: { name: true } },
          },
        },
        employees: {
          include: { user: { select: { name: true } } },
          orderBy: [{ roleOnVisit: "asc" }, { userId: "asc" }],
        },
        visitProducts: {
          include: { product: true },
          orderBy: { createdAt: "asc" },
        },
        pointChecks: {
          include: { point: { select: { label: true, type: true } } },
          orderBy: { point: { label: "asc" } },
        },
      },
    });

    if (!visit) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit not found");
    }

    const missing: string[] = [];
    if (!visit.siteId || !visit.site) missing.push("обект (site)");
    if (!visit.visitDate) missing.push("дата на посещение (visit_date)");
    if (!visit.treatmentType) missing.push("вид обработка (treatment_type)");
    if (visit.employees.length === 0) missing.push("поне един служител");
    if (missing.length > 0) {
      throw new AppException(
        ErrorCode.REPORT_INSUFFICIENT_DATA,
        `Недостатъчни данни за доклад: необходими са ${missing.join(", ")}`,
        { required: ["site", "visit_date", "treatment_type", "at_least_one_employee"], missing },
      );
    }

    const snapshot = visit.visitProductsSnapshot as VisitProductSnapshotEntry[] | null;
    const products: VisitProductSnapshotEntry[] =
      snapshot != null
        ? snapshot
        : visit.visitProducts.map((vp) => ({
            productId: vp.productId,
            name: vp.product.name,
            activeSubstances: vp.product.activeSubstances,
            formulation: vp.product.formulation,
            permitNumber: vp.product.permitNumber,
            antidote: vp.product.antidote,
            ventilationPeriod: vp.product.ventilationPeriod,
            exposurePeriod: vp.product.exposurePeriod,
            recommendations: vp.product.recommendations,
            quantity: vp.quantity.toString(),
            unit: vp.unit,
            notes: vp.notes,
          }));

    try {
      const html = this.pdf.renderTemplate(this.buildContent(visit, products));
      const buffer = await this.pdf.fromHtml(html, { footer: false });
      const visitDate = dateToIsoDate(visit.visitDate);
      const filename = `service-report-${slugify(visit.site.name)}-${visitDate}.pdf`;
      return { buffer, filename };
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(ErrorCode.REPORT_RENDER_FAILED, "Service report PDF render failed", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private buildContent(
    visit: {
      visitDate: Date;
      treatmentType: string;
      site: {
        name: string;
        address: string;
        client: { name: string };
      };
      employees: Array<{
        roleOnVisit: string;
        user: { name: string };
      }>;
      pointChecks: Array<{
        status: string;
        point: { label: string; type: string };
        notes: string | null;
      }>;
    },
    products: VisitProductSnapshotEntry[],
  ): string {
    const visitDate = dateToIsoDate(visit.visitDate);
    const treatment = TREATMENT_LABELS[visit.treatmentType] ?? visit.treatmentType;
    const employees = visit.employees
      .map((e) => {
        const role = e.roleOnVisit === "LEAD" ? "водещ" : "асистент";
        return `${escapeHtml(e.user.name)} (${role})`;
      })
      .join(", ");

    const recommendations = groupRecommendationsForReport(products);

    const productRows =
      products.length === 0
        ? `<tr><td colspan="5" style="color:#6B7280;font-style:italic">без използвани препарати</td></tr>`
        : products
            .map((p) => {
              const prominent =
                visit.treatmentType === ServiceType.RODENT_CONTROL
                  ? escapeHtml(p.activeSubstances.join(", ") || "—")
                  : escapeHtml(FORMULATION_LABELS[p.formulation] ?? p.formulation);
              return `<tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${prominent}</td>
                <td>${escapeHtml(p.activeSubstances.join(", ") || "—")}</td>
                <td>${escapeHtml(p.quantity)} ${escapeHtml(UNIT_LABELS[p.unit] ?? p.unit)}</td>
                <td>${escapeHtml(p.recommendations ?? "—")}</td>
              </tr>`;
            })
            .join("");

    const statusCounts = new Map<string, number>();
    for (const check of visit.pointChecks) {
      statusCounts.set(check.status, (statusCounts.get(check.status) ?? 0) + 1);
    }
    const checksSummary =
      visit.pointChecks.length === 0
        ? `<p style="color:#6B7280">Няма отбелязани проверки на точки.</p>`
        : `<p>Проверени точки: <strong>${visit.pointChecks.length}</strong>.
           ${[...statusCounts.entries()]
             .map(
               ([status, count]) =>
                 `${escapeHtml(STATUS_LABELS[status] ?? status)}: ${count}`,
             )
             .join("; ")}</p>
           <ul>${visit.pointChecks
             .map(
               (c) =>
                 `<li>${escapeHtml(c.point.label)} (${escapeHtml(c.point.type)}): ${escapeHtml(
                   STATUS_LABELS[c.status] ?? c.status,
                 )}${c.notes ? ` — ${escapeHtml(c.notes)}` : ""}</li>`,
             )
             .join("")}</ul>`;

    const recBlock =
      recommendations.length === 0
        ? `<p style="color:#6B7280">Няма препоръки от препарати.</p>`
        : `<ul>${recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;

    return `
<section style="font-family:Inter,sans-serif;color:#111827;font-size:11px;line-height:1.45">
  <header style="border-bottom:2px solid #111827;padding-bottom:8px;margin-bottom:16px">
    <div style="font-size:16px;font-weight:700">${escapeHtml(SUPPLIER.name)}</div>
    <div>${escapeHtml(SUPPLIER.address)} · ЕИК ${escapeHtml(SUPPLIER.eik)} · ${escapeHtml(SUPPLIER.phone)}</div>
    <div style="margin-top:8px;font-size:14px;font-weight:600">Доклад за извършена обработка — ${escapeHtml(treatment)}</div>
  </header>

  <table style="width:100%;margin-bottom:14px">
    <tr><td style="width:28%;color:#6B7280">Клиент</td><td>${escapeHtml(visit.site.client.name)}</td></tr>
    <tr><td style="color:#6B7280">Обект</td><td>${escapeHtml(visit.site.name)}</td></tr>
    <tr><td style="color:#6B7280">Адрес</td><td>${escapeHtml(visit.site.address)}</td></tr>
    <tr><td style="color:#6B7280">Дата</td><td>${escapeHtml(visitDate)}</td></tr>
    <tr><td style="color:#6B7280">Служители</td><td>${employees}</td></tr>
    <tr><td style="color:#6B7280">Вид обработка</td><td>${escapeHtml(treatment)}</td></tr>
  </table>

  <h2 style="font-size:12px;margin:16px 0 6px">Използвани препарати</h2>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #D1D5DB">
        <th style="padding:4px 2px">Име</th>
        <th style="padding:4px 2px">${visit.treatmentType === ServiceType.RODENT_CONTROL ? "Акт. вещества" : "Формулация"}</th>
        <th style="padding:4px 2px">Активни вещества</th>
        <th style="padding:4px 2px">Кол.</th>
        <th style="padding:4px 2px">Препоръки</th>
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>

  <h2 style="font-size:12px;margin:16px 0 6px">Точки NEOT/POT</h2>
  ${checksSummary}

  <h2 style="font-size:12px;margin:16px 0 6px">Препоръки</h2>
  ${recBlock}

  <div style="margin-top:36px;display:flex;justify-content:space-between;gap:24px">
    <div style="flex:1;border-top:1px solid #111827;padding-top:6px">Представител на клиента</div>
    <div style="flex:1;border-top:1px solid #111827;padding-top:6px">Служител</div>
  </div>
</section>`;
  }
}
