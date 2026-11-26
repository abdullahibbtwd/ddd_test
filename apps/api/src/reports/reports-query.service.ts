import {
  addMoney,
  agingBucketFromDueDate,
  classifyInvoice,
  compareMoney,
  computeOutstanding,
  computeScheduleStatus,
  DocumentType,
  EmployeeRoleOnVisit,
  ExpirationKind,
  firstDayOfMonth,
  groupingKey,
  InvoicePaymentClassification,
  InvoiceStatus,
  lastDayOfMonth,
  monthOf,
  monthRange,
  PaymentRecordMethod,
  quantityByUnit,
  ReportKind,
  RevenueGrouping,
  ScheduleStatus,
  subtractMoney,
  todayInSofia,
  VisitStatus,
  type ReportCashPage,
  type ReportCashQuery,
  type ReportExpirationsPage,
  type ReportExpirationsQuery,
  type ReportOutstandingPage,
  type ReportOutstandingQuery,
  type ReportProductsPage,
  type ReportProductsQuery,
  type ReportRevenuePage,
  type ReportRevenueQuery,
  type ReportServiceCoveragePage,
  type ReportServiceCoverageQuery,
  type RevenueGroupingInput,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { auditReadPii } from "../compliance/pii-audit";
import { AuditService } from "../audit/audit.service";
import type { PaymentMethod as PrismaPaymentMethod } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function moneyString(value: { toString(): string } | number | string): string {
  return Number(value).toFixed(2);
}

function negateMoney(value: string): string {
  if (value === "0.00" || value === "0") return "0.00";
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

@Injectable()
export class ReportsQueryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async revenue(
    query: ReportRevenueQuery,
    _actorUserId: string,
  ): Promise<ReportRevenuePage> {
    const where = {
      status: {
        in: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE],
      },
      documentType: {
        in: [
          DocumentType.INVOICE,
          DocumentType.CREDIT_NOTE,
          DocumentType.DEBIT_NOTE,
        ],
      },
      ...(query.from || query.to
        ? {
            issuedAt: {
              ...(query.from
                ? { gte: new Date(`${query.from}T00:00:00.000+02:00`) }
                : {}),
              ...(query.to
                ? { lt: new Date(`${query.to}T23:59:59.999+02:00`) }
                : {}),
            },
          }
        : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.siteId ? { siteId: query.siteId } : {}),
      ...(query.areaId ? { site: { areaId: query.areaId } } : {}),
    };

    const rows = await this.prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        site: {
          select: {
            id: true,
            name: true,
            areaId: true,
            area: { select: { id: true, name: true } },
          },
        },
        visits: {
          include: {
            visit: {
              include: {
                employees: {
                  where: { roleOnVisit: EmployeeRoleOnVisit.LEAD },
                  include: { user: { select: { id: true, name: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
    });

    let mapped = rows
      .filter((r) => {
        if (!query.employeeId) return true;
        const lead = r.visits[0]?.visit.employees[0]?.user.id;
        return lead === query.employeeId;
      })
      .map((r) => {
        const lead = r.visits[0]?.visit.employees[0]?.user;
        const sign =
          r.documentType === DocumentType.CREDIT_NOTE ? -1 : 1;
        const net = moneyString(r.netAmount);
        const vat = moneyString(r.vatAmount);
        const gross = moneyString(r.grossAmount);
        const periodMonth = r.issuedAt ? monthOf(dateToIsoDate(r.issuedAt)) : null;
        const dims: RevenueGroupingInput = {
          clientId: r.clientId,
          siteId: r.siteId,
          areaId: r.site?.areaId ?? null,
          employeeId: lead?.id ?? null,
          serviceKey: r.visits[0]?.visit.treatmentType ?? null,
          periodMonth,
        };
        return {
          documentId: r.id,
          documentType: r.documentType,
          number: r.number,
          issuedAt: r.issuedAt ? dateToIsoDate(r.issuedAt) : null,
          clientId: r.clientId,
          clientName: r.client.name,
          clientLegalName: r.clientLegalName,
          clientEik: r.clientEik,
          siteId: r.siteId,
          siteName: r.site?.name ?? null,
          areaId: r.site?.areaId ?? null,
          areaName: r.site?.area.name ?? null,
          employeeId: lead?.id ?? null,
          employeeName: lead?.name ?? null,
          serviceKey: dims.serviceKey,
          periodMonth,
          netAmount: sign < 0 ? negateMoney(net) : net,
          vatAmount: sign < 0 ? negateMoney(vat) : vat,
          grossAmount: sign < 0 ? negateMoney(gross) : gross,
          _dims: dims,
        };
      });

    if (query.groupBy) {
      const mode = query.groupBy as RevenueGrouping;
      const groups = new Map<
        string,
        {
          groupKey: string;
          groupLabel: string;
          netAmount: string;
          vatAmount: string;
          grossAmount: string;
          sample: (typeof mapped)[0];
        }
      >();
      for (const row of mapped) {
        const key = groupingKey(row._dims, mode);
        const prev = groups.get(key);
        if (!prev) {
          groups.set(key, {
            groupKey: key,
            groupLabel: this.groupLabel(row, mode),
            netAmount: row.netAmount,
            vatAmount: row.vatAmount,
            grossAmount: row.grossAmount,
            sample: row,
          });
        } else {
          prev.netAmount = addMoney(prev.netAmount, row.netAmount);
          prev.vatAmount = addMoney(prev.vatAmount, row.vatAmount);
          prev.grossAmount = addMoney(prev.grossAmount, row.grossAmount);
        }
      }
      mapped = [...groups.values()].map((g) => ({
        ...g.sample,
        groupKey: g.groupKey,
        groupLabel: g.groupLabel,
        netAmount: g.netAmount,
        vatAmount: g.vatAmount,
        grossAmount: g.grossAmount,
      }));
    }

    const totals = mapped.reduce(
      (acc, r) => ({
        netAmount: addMoney(acc.netAmount, r.netAmount),
        vatAmount: addMoney(acc.vatAmount, r.vatAmount),
        grossAmount: addMoney(acc.grossAmount, r.grossAmount),
      }),
      { netAmount: "0.00", vatAmount: "0.00", grossAmount: "0.00" },
    );

    const items = pageSlice(mapped, query.page, query.pageSize).map(
      ({ _dims: _, ...rest }) => rest,
    );

    return {
      items,
      totals,
      filter: {
        from: query.from,
        to: query.to,
        areaId: query.areaId,
        employeeId: query.employeeId,
        clientId: query.clientId,
        siteId: query.siteId,
        groupBy: query.groupBy,
      },
      page: query.page,
      pageSize: query.pageSize,
      total: mapped.length,
    };
  }

  private groupLabel(
    row: {
      clientName: string | null;
      siteName: string | null;
      areaName: string | null;
      employeeName: string | null;
      serviceKey: string | null;
      periodMonth: string | null;
    },
    mode: RevenueGrouping,
  ): string {
    switch (mode) {
      case RevenueGrouping.CLIENT:
        return row.clientName ?? "—";
      case RevenueGrouping.SITE:
        return row.siteName ?? "—";
      case RevenueGrouping.AREA:
        return row.areaName ?? "—";
      case RevenueGrouping.EMPLOYEE:
        return row.employeeName ?? "—";
      case RevenueGrouping.SERVICE:
        return row.serviceKey ?? "—";
      case RevenueGrouping.PERIOD:
        return row.periodMonth ?? "—";
      default:
        return "—";
    }
  }

  async serviceCoverage(
    query: ReportServiceCoverageQuery,
  ): Promise<ReportServiceCoveragePage> {
    const from = query.from ?? todayInSofia(new Date());
    const to = query.to ?? from;
    const months = monthRange(from, to);
    const asOf = todayInSofia(new Date());

    const sites = await this.prisma.site.findMany({
      where: {
        ...(query.areaId ? { areaId: query.areaId } : {}),
      },
      select: {
        id: true,
        name: true,
        areaId: true,
        area: { select: { name: true } },
        subscriptions: {
          select: {
            frequency: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { startDate: "desc" },
        },
        visits: {
          where: { status: VisitStatus.ACTIVE },
          select: { visitDate: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const items: ReportServiceCoveragePage["items"] = [];
    const totals: ReportServiceCoveragePage["totals"] = {
      SERVICED: 0,
      OVERDUE: 0,
      UPCOMING: 0,
      NOT_DUE: 0,
      NOT_STARTED: 0,
      ENDED: 0,
      ON_DEMAND: 0,
    };

    for (const site of sites) {
      for (const month of months) {
        const monthAsOf = asOf < lastDayOfMonth(month) ? asOf : lastDayOfMonth(month);
        const sub = site.subscriptions.find((s) => {
          const start = dateToIsoDate(s.startDate);
          const end = s.endDate ? dateToIsoDate(s.endDate) : null;
          return start <= lastDayOfMonth(month) && (!end || end >= firstDayOfMonth(month));
        });
        let status: (typeof ScheduleStatus)[keyof typeof ScheduleStatus] =
          ScheduleStatus.NOT_DUE;
        if (sub) {
          const computed = computeScheduleStatus({
            frequency: sub.frequency,
            startDate: dateToIsoDate(sub.startDate),
            endDate: sub.endDate ? dateToIsoDate(sub.endDate) : null,
            doneVisitDates: site.visits.map((v) => dateToIsoDate(v.visitDate)),
            asOf: monthAsOf,
          });
          status = computed.status;
        }
        totals[status] += 1;
        items.push({
          siteId: site.id,
          siteName: site.name,
          areaId: site.areaId,
          areaName: site.area.name,
          month,
          status,
        });
      }
    }

    return {
      items: pageSlice(items, query.page, query.pageSize),
      totals,
      filter: { from: query.from, to: query.to, areaId: query.areaId },
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }

  async outstanding(
    query: ReportOutstandingQuery,
  ): Promise<ReportOutstandingPage> {
    const asOf = query.asOf ?? todayInSofia(new Date());
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: {
          in: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE],
        },
        documentType: DocumentType.INVOICE,
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.areaId ? { site: { areaId: query.areaId } } : {}),
        ...(query.from || query.to
          ? {
              dueDate: {
                ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
                ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        number: true,
        clientId: true,
        dueDate: true,
        grossAmount: true,
        status: true,
        clientLegalName: true,
        clientEik: true,
        client: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });

    const paidGroups = await this.prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { invoiceId: { in: invoices.map((i) => i.id) } },
      _sum: { amount: true },
    });
    const paidMap = new Map(
      paidGroups.map((g) => [g.invoiceId, moneyString(g._sum.amount ?? 0)]),
    );

    const rows = invoices
      .map((inv) => {
        const paidSum = paidMap.get(inv.id) ?? "0.00";
        const gross = moneyString(inv.grossAmount);
        const outstanding = computeOutstanding(gross, [paidSum]);
        const dueDate = inv.dueDate ? dateToIsoDate(inv.dueDate) : asOf;
        const classification = classifyInvoice({
          status: inv.status,
          dueDate: inv.dueDate ? dueDate : null,
          outstanding,
          asOf,
        });
        const agingBucket =
          classification === InvoicePaymentClassification.OVERDUE
            ? agingBucketFromDueDate(dueDate, asOf)
            : null;
        return {
          invoiceId: inv.id,
          number: inv.number ?? "",
          clientId: inv.clientId,
          clientName: inv.client.name,
          clientLegalName: inv.clientLegalName,
          clientEik: inv.clientEik,
          dueDate,
          grossAmount: gross,
          paidSum,
          outstanding,
          agingBucket,
        };
      })
      .filter((r) => compareMoney(r.outstanding, "0.00") > 0);

    const totals = {
      outstanding: "0.00",
      "0_30": "0.00",
      "31_60": "0.00",
      "61_90": "0.00",
      "90_plus": "0.00",
    };
    for (const r of rows) {
      totals.outstanding = addMoney(totals.outstanding, r.outstanding);
      if (r.agingBucket) {
        totals[r.agingBucket] = addMoney(totals[r.agingBucket], r.outstanding);
      }
    }

    return {
      items: pageSlice(rows, query.page, query.pageSize),
      totals,
      filter: {
        from: query.from,
        to: query.to,
        clientId: query.clientId,
        areaId: query.areaId,
        asOf: query.asOf,
      },
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length,
    };
  }

  async cash(query: ReportCashQuery): Promise<ReportCashPage> {
    const paymentWhere = {
      method: PaymentRecordMethod.CASH as PrismaPaymentMethod,
      collectedByUserId: query.employeeId
        ? query.employeeId
        : { not: null as string | null },
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
              ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
            },
          }
        : {}),
    };
    const handoverWhere = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.from || query.to
        ? {
            handedOverAt: {
              ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
              ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
            },
          }
        : {}),
    };

    const [payments, handovers] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: {
          amount: true,
          paidAt: true,
          collectedByUserId: true,
          collectedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.cashHandover.findMany({
        where: handoverWhere,
        select: {
          amount: true,
          handedOverAt: true,
          employeeId: true,
          employee: { select: { id: true, name: true } },
        },
      }),
    ]);

    type DayAcc = {
      employeeId: string;
      employeeName: string;
      date: string;
      collected: string;
      handedOver: string;
    };
    const map = new Map<string, DayAcc>();

    for (const p of payments) {
      if (!p.collectedByUserId || !p.collectedBy) continue;
      const date = dateToIsoDate(p.paidAt);
      const key = `${p.collectedByUserId}|${date}`;
      const prev = map.get(key) ?? {
        employeeId: p.collectedByUserId,
        employeeName: p.collectedBy.name,
        date,
        collected: "0.00",
        handedOver: "0.00",
      };
      prev.collected = addMoney(prev.collected, moneyString(p.amount));
      map.set(key, prev);
    }
    for (const h of handovers) {
      const date = dateToIsoDate(h.handedOverAt);
      const key = `${h.employeeId}|${date}`;
      const prev = map.get(key) ?? {
        employeeId: h.employeeId,
        employeeName: h.employee.name,
        date,
        collected: "0.00",
        handedOver: "0.00",
      };
      prev.handedOver = addMoney(prev.handedOver, moneyString(h.amount));
      map.set(key, prev);
    }

    const items = [...map.values()]
      .map((r) => ({
        ...r,
        net: subtractMoney(r.collected, r.handedOver),
      }))
      .sort((a, b) =>
        a.date === b.date
          ? a.employeeName.localeCompare(b.employeeName)
          : a.date.localeCompare(b.date),
      );

    const byEmployeeMap = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        collected: string;
        handedOver: string;
        net: string;
      }
    >();
    let totalsCollected = "0.00";
    let totalsHanded = "0.00";
    for (const r of items) {
      totalsCollected = addMoney(totalsCollected, r.collected);
      totalsHanded = addMoney(totalsHanded, r.handedOver);
      const prev = byEmployeeMap.get(r.employeeId) ?? {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        collected: "0.00",
        handedOver: "0.00",
        net: "0.00",
      };
      prev.collected = addMoney(prev.collected, r.collected);
      prev.handedOver = addMoney(prev.handedOver, r.handedOver);
      prev.net = subtractMoney(prev.collected, prev.handedOver);
      byEmployeeMap.set(r.employeeId, prev);
    }

    return {
      items: pageSlice(items, query.page, query.pageSize),
      totals: {
        collected: totalsCollected,
        handedOver: totalsHanded,
        net: subtractMoney(totalsCollected, totalsHanded),
        byEmployee: [...byEmployeeMap.values()],
      },
      filter: {
        from: query.from,
        to: query.to,
        employeeId: query.employeeId,
      },
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }

  async expirations(
    query: ReportExpirationsQuery,
    actorUserId: string,
    options?: { skipPiiAudit?: boolean },
  ): Promise<ReportExpirationsPage> {
    const kinds = query.kinds?.length
      ? query.kinds
      : [
          ExpirationKind.CERTIFICATE,
          ExpirationKind.AGREEMENT,
          ExpirationKind.FOOD,
        ];
    const asOf = todayInSofia(new Date());
    const rows: ReportExpirationsPage["items"] = [];
    const certIds: string[] = [];

    if (kinds.includes(ExpirationKind.CERTIFICATE)) {
      const certs = await this.prisma.healthCertificate.findMany({
        where: {
          ...(query.from || query.to
            ? {
                nextRenewalAt: {
                  ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
                  ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
                },
              }
            : {}),
          ...(query.areaId
            ? {
                clientEmployee: {
                  OR: [
                    { site: { areaId: query.areaId } },
                    {
                      siteId: null,
                      client: { sites: { some: { areaId: query.areaId } } },
                    },
                  ],
                },
              }
            : {}),
          clientEmployee: { erasedAt: null },
        },
        select: {
          id: true,
          nextRenewalAt: true,
          clientEmployee: {
            select: {
              fullName: true,
              site: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { nextRenewalAt: "asc" },
      });
      for (const c of certs) {
        certIds.push(c.id);
        const due = dateToIsoDate(c.nextRenewalAt);
        rows.push({
          kind: ExpirationKind.CERTIFICATE,
          entityId: c.id,
          subject: c.clientEmployee.fullName,
          siteId: c.clientEmployee.site?.id ?? null,
          siteName: c.clientEmployee.site?.name ?? null,
          dueDate: due,
          status: due < asOf ? "EXPIRED" : due <= asOf ? "DUE" : "UPCOMING",
        });
      }
    }

    if (kinds.includes(ExpirationKind.AGREEMENT)) {
      const agreements = await this.prisma.agreement.findMany({
        where: {
          ...(query.from || query.to
            ? {
                expiresAt: {
                  ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
                  ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
                },
              }
            : {}),
          ...(query.areaId ? { site: { areaId: query.areaId } } : {}),
        },
        select: {
          id: true,
          serviceType: true,
          expiresAt: true,
          siteId: true,
          site: { select: { name: true } },
        },
        orderBy: { expiresAt: "asc" },
      });
      for (const a of agreements) {
        const due = dateToIsoDate(a.expiresAt);
        rows.push({
          kind: ExpirationKind.AGREEMENT,
          entityId: a.id,
          subject: `${a.serviceType} · ${a.site.name}`,
          siteId: a.siteId,
          siteName: a.site.name,
          dueDate: due,
          status: due < asOf ? "EXPIRED" : "UPCOMING",
        });
      }
    }

    if (kinds.includes(ExpirationKind.FOOD)) {
      const foods = await this.prisma.foodSamplingSchedule.findMany({
        where: {
          active: true,
          ...(query.from || query.to
            ? {
                nextDueAt: {
                  ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
                  ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
                },
              }
            : {}),
          ...(query.areaId ? { site: { areaId: query.areaId } } : {}),
        },
        select: {
          id: true,
          nextDueAt: true,
          siteId: true,
          site: { select: { name: true } },
        },
        orderBy: { nextDueAt: "asc" },
      });
      for (const f of foods) {
        const due = dateToIsoDate(f.nextDueAt);
        rows.push({
          kind: ExpirationKind.FOOD,
          entityId: f.id,
          subject: f.site.name,
          siteId: f.siteId,
          siteName: f.site.name,
          dueDate: due,
          status: due < asOf ? "OVERDUE" : "DUE",
        });
      }
    }

    // One READ_PII per HTTP request. Export countRows + pages > 1 pass skipPiiAudit.
    if (!options?.skipPiiAudit) {
      await auditReadPii(this.audit, {
        table: "health_certificates",
        entityIds: certIds,
        actorUserId,
      });
    }

    rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const totals = {
      CERTIFICATE: rows.filter((r) => r.kind === ExpirationKind.CERTIFICATE)
        .length,
      AGREEMENT: rows.filter((r) => r.kind === ExpirationKind.AGREEMENT).length,
      FOOD: rows.filter((r) => r.kind === ExpirationKind.FOOD).length,
    };

    return {
      items: pageSlice(rows, query.page, query.pageSize),
      totals,
      filter: {
        from: query.from,
        to: query.to,
        areaId: query.areaId,
        kinds: query.kinds,
      },
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length,
    };
  }

  async products(
    query: ReportProductsQuery,
  ): Promise<ReportProductsPage> {
    const visitProducts = await this.prisma.visitProduct.findMany({
      where: {
        visit: {
          status: { not: VisitStatus.CANCELLED },
          ...(query.from || query.to
            ? {
                visitDate: {
                  ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
                  ...(query.to ? { lte: isoDateToDate(query.to) } : {}),
                },
              }
            : {}),
          ...(query.siteId ? { siteId: query.siteId } : {}),
        },
        ...(query.productIds?.length
          ? { productId: { in: query.productIds } }
          : {}),
      },
      select: {
        quantity: true,
        unit: true,
        productId: true,
        product: {
          select: { id: true, name: true, activeSubstances: true },
        },
        visit: { select: { visitDate: true } },
      },
    });

    type Acc = {
      productId: string;
      productName: string;
      activeSubstances: string | null;
      unit: string;
      totalQuantity: string;
      period: string;
    };
    const map = new Map<string, Acc>();
    for (const vp of visitProducts) {
      const period = monthOf(dateToIsoDate(vp.visit.visitDate));
      const key = `${vp.productId}|${period}|${vp.unit}`;
      const q3 = Number(vp.quantity).toFixed(3);
      const substances = vp.product.activeSubstances.join(", ") || null;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          productId: vp.productId,
          productName: vp.product.name,
          activeSubstances: substances,
          unit: String(vp.unit),
          totalQuantity: q3,
          period,
        });
      } else {
        prev.totalQuantity = (
          Number(prev.totalQuantity) + Number(q3)
        ).toFixed(3);
      }
    }

    const items = [...map.values()].sort((a, b) =>
      a.period === b.period
        ? a.productName.localeCompare(b.productName)
        : a.period.localeCompare(b.period),
    );

    const byUnit = quantityByUnit(
      items.map((i) => ({ quantity: i.totalQuantity, unit: i.unit })),
    );

    return {
      items: pageSlice(items, query.page, query.pageSize),
      totals: { byUnit },
      filter: {
        from: query.from,
        to: query.to,
        productIds: query.productIds,
        siteId: query.siteId,
      },
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }

  async countRows(
    kind: (typeof ReportKind)[keyof typeof ReportKind],
    filter: Record<string, unknown>,
    actorUserId: string,
  ): Promise<number> {
    const page = 1;
    const pageSize = 1;
    switch (kind) {
      case ReportKind.REVENUE: {
        const r = await this.revenue(
          { ...(filter as ReportRevenueQuery), page, pageSize },
          actorUserId,
        );
        return r.total;
      }
      case ReportKind.SERVICE_COVERAGE: {
        const r = await this.serviceCoverage({
          ...(filter as ReportServiceCoverageQuery),
          page,
          pageSize,
        });
        return r.total;
      }
      case ReportKind.OUTSTANDING: {
        const r = await this.outstanding({
          ...(filter as ReportOutstandingQuery),
          page,
          pageSize,
        });
        return r.total;
      }
      case ReportKind.CASH: {
        const r = await this.cash({
          ...(filter as ReportCashQuery),
          page,
          pageSize,
        });
        return r.total;
      }
      case ReportKind.EXPIRATIONS: {
        const r = await this.expirations(
          { ...(filter as ReportExpirationsQuery), page, pageSize },
          actorUserId,
          { skipPiiAudit: true },
        );
        return r.total;
      }
      case ReportKind.PRODUCTS: {
        const r = await this.products({
          ...(filter as ReportProductsQuery),
          page,
          pageSize,
        });
        return r.total;
      }
      default:
        return 0;
    }
  }
}
