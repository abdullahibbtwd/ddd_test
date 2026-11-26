import {
  addMoney,
  agingBuckets,
  classifyInvoice,
  compareMoney,
  computeEmployeeCash,
  computeOutstanding,
  createId,
  defineAbilityFor,
  EmailEventKind,
  ErrorCode,
  InvoicePaymentClassification,
  InvoiceStatus,
  jobId,
  PaymentRecordMethod,
  Role,
  todayInSofia,
  type CashLedgerQuery,
  type CashLedgerResponse,
  type EmailEnqueueResult,
  type EmailEventList,
  type HandoverCreateBody,
  type HandoverCreateResult,
  type OutstandingPage,
  type OutstandingQuery,
  type PaymentCreateFieldBody,
  type PaymentCreateOfficeBody,
  type PaymentItem,
  type PaymentList,
  type ReminderSendBody,
} from "@ddcrm/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import type { Queue } from "bullmq";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type { PaymentMethod as PrismaPaymentMethod } from "../generated/prisma/client";
import { lockInvoiceForUpdate } from "../prisma/lock-invoice";
import { PrismaService } from "../prisma/prisma.service";

export const PAYMENT_REMINDER_JOB = "send-payment-reminder";

export type PaymentReminderJobData = {
  invoiceId: string;
  emailEventId: string;
  to: string;
  attempt: number;
};

function moneyString(value: { toString(): string } | number | string): string {
  return Number(value).toFixed(2);
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PAYMENT_REMINDER)
    private readonly reminderQueue: Queue<PaymentReminderJobData>,
  ) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertCan(
    user: AuthRequestUser,
    action: "create" | "read" | "manage" | "sendReminder",
    subject:
      | "Payment"
      | "CashHandover"
      | "CashLedger"
      | "Outstanding"
      | "Invoice",
  ) {
    const ability = this.abilityFor(user);
    if (!ability.can(action as never, subject as never)) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private isSqlState(error: unknown, code: string): boolean {
    const walk = (value: unknown, depth = 0): boolean => {
      if (depth > 6 || value == null || typeof value !== "object") return false;
      const obj = value as Record<string, unknown>;
      if (obj.code === code) return true;
      if (typeof obj.message === "string" && obj.message.includes(code)) return true;
      for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
        if (key in obj && walk(obj[key], depth + 1)) return true;
      }
      return false;
    };
    return walk(error);
  }

  private mapWriteError(error: unknown, kind: "payment" | "handover"): never {
    if (this.isSqlState(error, "23P03")) {
      throw new AppException(
        ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
        "Payment exceeds outstanding balance",
      );
    }
    if (this.isSqlState(error, "23P02")) {
      throw new AppException(
        kind === "handover" ? ErrorCode.HANDOVER_IMMUTABLE : ErrorCode.PAYMENT_IMMUTABLE,
        kind === "handover" ? "Handover is immutable" : "Payment is immutable",
      );
    }
    if (error instanceof AppException) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (/payments_cash_collector|payments_method_allowed|CHECK/i.test(msg)) {
      throw new AppException(
        ErrorCode.PAYMENT_METHOD_MISMATCH,
        "Payment method / collector mismatch",
      );
    }
    throw error;
  }

  private toPaymentItem(row: {
    id: string;
    invoiceId: string;
    amount: { toString(): string };
    method: PrismaPaymentMethod;
    paidAt: Date;
    collectedByUserId: string | null;
    notes: string | null;
    createdById: string;
    createdAt: Date;
    collectedBy?: { name: string } | null;
  }): PaymentItem {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      amount: moneyString(row.amount),
      method: row.method as PaymentItem["method"],
      paidAt: dateToIsoDate(row.paidAt),
      collectedByUserId: row.collectedByUserId,
      collectedByName: row.collectedBy?.name ?? null,
      notes: row.notes,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async paidSumForInvoice(
    invoiceId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx?: { payment: { aggregate: (...args: any[]) => Promise<any> } },
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const agg = await client.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    return moneyString(agg._sum.amount ?? 0);
  }

  async createOfficePayment(
    user: AuthRequestUser,
    invoiceId: string,
    body: PaymentCreateOfficeBody,
  ): Promise<PaymentItem> {
    this.assertCan(user, "create", "Payment");
    if (user.role === Role.FIELD) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }

    if (body.method === PaymentRecordMethod.CASH) {
      if (!body.collectedByUserId) {
        throw new AppException(
          ErrorCode.PAYMENT_METHOD_MISMATCH,
          "collectedByUserId required for CASH",
        );
      }
    } else if (body.collectedByUserId) {
      throw new AppException(
        ErrorCode.PAYMENT_METHOD_MISMATCH,
        "collectedByUserId forbidden for non-CASH",
      );
    }

    try {
      const row = await this.prisma.transaction(async (tx) => {
        const locked = await lockInvoiceForUpdate(tx, invoiceId);
        if (!locked) {
          throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
        }
        if (locked.status !== InvoiceStatus.ISSUED) {
          throw new AppException(
            ErrorCode.INVOICE_NOT_ISSUED,
            "Invoice is not issued",
          );
        }

        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { grossAmount: true },
        });
        const paid = await this.paidSumForInvoice(invoiceId, tx);
        const outstanding = computeOutstanding(moneyString(invoice.grossAmount), [
          paid,
        ]);
        if (compareMoney(body.amount, outstanding) > 0) {
          throw new AppException(
            ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
            "Payment exceeds outstanding balance",
          );
        }

        return tx.payment.create({
          data: {
            id: createId(),
            invoiceId,
            amount: body.amount,
            method: body.method,
            paidAt: isoDateToDate(body.paidAt),
            collectedByUserId:
              body.method === PaymentRecordMethod.CASH
                ? body.collectedByUserId!
                : null,
            notes: body.notes ?? null,
            createdById: user.id,
          },
          include: { collectedBy: { select: { name: true } } },
        });
      });
      return this.toPaymentItem(row);
    } catch (error) {
      this.mapWriteError(error, "payment");
    }
  }

  async createFieldPayment(
    user: AuthRequestUser,
    visitId: string,
    body: PaymentCreateFieldBody,
  ): Promise<PaymentItem> {
    this.assertCan(user, "create", "Payment");

    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        createdById: true,
        invoiceLinks: { select: { invoiceId: true }, take: 1 },
      },
    });
    if (!visit) {
      throw new AppException(ErrorCode.NOT_FOUND, "Visit not found");
    }

    if (user.role === Role.FIELD && visit.createdById !== user.id) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }

    const invoiceId = visit.invoiceLinks[0]?.invoiceId;
    if (!invoiceId) {
      throw new AppException(
        ErrorCode.VISIT_NOT_INVOICED,
        "Visit has no invoice yet",
      );
    }

    // OFFICE may supply collectedBy via... field body doesn't have it.
    // FIELD always = actor. OFFICE/ADMIN recording via visit route = actor as collector
    // unless we extend — task says: "or the supplied collectedByUserId for OFFICE".
    // Field body schema has no collectedByUserId; OFFICE using visit route uses actor.
    const collectorId = user.id;

    try {
      const row = await this.prisma.transaction(async (tx) => {
        const locked = await lockInvoiceForUpdate(tx, invoiceId);
        if (!locked) {
          throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
        }
        if (locked.status !== InvoiceStatus.ISSUED) {
          throw new AppException(
            ErrorCode.INVOICE_NOT_ISSUED,
            "Invoice is not issued",
          );
        }

        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { grossAmount: true },
        });
        const paid = await this.paidSumForInvoice(invoiceId, tx);
        const outstanding = computeOutstanding(moneyString(invoice.grossAmount), [
          paid,
        ]);
        if (compareMoney(body.amount, outstanding) > 0) {
          throw new AppException(
            ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
            "Payment exceeds outstanding balance",
          );
        }

        return tx.payment.create({
          data: {
            id: createId(),
            invoiceId,
            amount: body.amount,
            method: PaymentRecordMethod.CASH,
            paidAt: isoDateToDate(body.paidAt),
            collectedByUserId: collectorId,
            notes: body.notes ?? null,
            createdById: user.id,
          },
          include: { collectedBy: { select: { name: true } } },
        });
      });
      return this.toPaymentItem(row);
    } catch (error) {
      this.mapWriteError(error, "payment");
    }
  }

  async listInvoicePayments(
    user: AuthRequestUser,
    invoiceId: string,
  ): Promise<PaymentList> {
    this.assertCan(user, "read", "Payment");

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        grossAmount: true,
        visits: {
          select: {
            visit: { select: { createdById: true } },
          },
        },
      },
    });
    if (!invoice) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }

    if (user.role === Role.FIELD) {
      const ownsVisit = invoice.visits.some((v) => v.visit.createdById === user.id);
      if (!ownsVisit) {
        throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
      }
    }

    const where =
      user.role === Role.FIELD
        ? { invoiceId, createdById: user.id }
        : { invoiceId };

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: { collectedBy: { select: { name: true } } },
    });

    const paidSum = await this.paidSumForInvoice(invoiceId);
    const gross = moneyString(invoice.grossAmount);
    return {
      items: rows.map((r) => this.toPaymentItem(r)),
      outstanding: computeOutstanding(gross, [paidSum]),
      grossAmount: gross,
      paidSum,
    };
  }

  async createHandover(
    user: AuthRequestUser,
    body: HandoverCreateBody,
  ): Promise<HandoverCreateResult> {
    this.assertCan(user, "create", "CashHandover");

    try {
      const handover = await this.prisma.cashHandover.create({
        data: {
          id: createId(),
          employeeId: body.employeeId,
          amount: body.amount,
          handedOverAt: isoDateToDate(body.handedOverAt),
          receivedByUserId: body.receivedByUserId,
          notes: body.notes ?? null,
          createdById: user.id,
        },
        include: {
          employee: { select: { name: true } },
          receivedBy: { select: { name: true } },
        },
      });

      const cash = await this.employeeCashTotals(body.employeeId);
      return {
        handover: {
          id: handover.id,
          employeeId: handover.employeeId,
          employeeName: handover.employee.name,
          amount: moneyString(handover.amount),
          handedOverAt: dateToIsoDate(handover.handedOverAt),
          receivedByUserId: handover.receivedByUserId,
          receivedByName: handover.receivedBy.name,
          notes: handover.notes,
          createdAt: handover.createdAt.toISOString(),
          createdById: handover.createdById,
        },
        ...cash,
      };
    } catch (error) {
      this.mapWriteError(error, "handover");
    }
  }

  private async employeeCashTotals(employeeId: string): Promise<{
    collected: string;
    handedOver: string;
    outstanding: string;
  }> {
    const [payAgg, handAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          method: PaymentRecordMethod.CASH,
          collectedByUserId: employeeId,
        },
        _sum: { amount: true },
      }),
      this.prisma.cashHandover.aggregate({
        where: { employeeId },
        _sum: { amount: true },
      }),
    ]);
    const collected = moneyString(payAgg._sum.amount ?? 0);
    const handedOver = moneyString(handAgg._sum.amount ?? 0);
    return computeEmployeeCash({
      payments: collected === "0.00" ? [] : [collected],
      handovers: handedOver === "0.00" ? [] : [handedOver],
    });
  }

  async outstandingReport(
    user: AuthRequestUser,
    query: OutstandingQuery,
  ): Promise<OutstandingPage> {
    this.assertCan(user, "read", "Outstanding");

    const asOf = query.asOf ?? todayInSofia(new Date());
    const page = query.page;
    const pageSize = query.pageSize;

    // Aggregate paid sums in SQL via groupBy, then join in app for classification.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: {
          in: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE],
        },
        documentType: "INVOICE",
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.areaId
          ? { site: { areaId: query.areaId } }
          : {}),
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
        client: { select: { name: true } },
      },
      orderBy: [{ dueDate: "desc" }, { number: "desc" }],
    });

    const paidGroups = await this.prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { invoiceId: { in: invoices.map((i) => i.id) } },
      _sum: { amount: true },
    });
    const paidMap = new Map(
      paidGroups.map((g) => [g.invoiceId, moneyString(g._sum.amount ?? 0)]),
    );

    const rows = invoices.map((inv) => {
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
          ? agingBuckets(dueDate, asOf)
          : null;
      return {
        invoiceId: inv.id,
        number: inv.number ?? "",
        clientId: inv.clientId,
        clientName: inv.client.name,
        dueDate,
        grossAmount: gross,
        paidSum,
        outstanding,
        classification,
        agingBucket,
      };
    });

    const filtered = query.status
      ? rows.filter((r) => r.classification === query.status)
      : rows;

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { items, page, pageSize, total };
  }

  async cashLedger(
    user: AuthRequestUser,
    query: CashLedgerQuery,
  ): Promise<CashLedgerResponse> {
    this.assertCan(user, "read", "CashLedger");

    let employeeId = query.employeeId;
    if (user.role === Role.FIELD) {
      if (query.employeeId && query.employeeId !== user.id) {
        throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
      }
      employeeId = user.id;
    }

    const paymentWhere = {
      method: PaymentRecordMethod.CASH as PrismaPaymentMethod,
      collectedByUserId: employeeId ? employeeId : { not: null as string | null },
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
      ...(employeeId ? { employeeId } : {}),
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

    type Acc = {
      employeeId: string;
      employeeName: string;
      payments: string[];
      handovers: string[];
      dayMap: Map<string, { collected: string; handedOver: string }>;
    };

    const byEmployee = new Map<string, Acc>();

    const ensure = (id: string, name: string): Acc => {
      let acc = byEmployee.get(id);
      if (!acc) {
        acc = {
          employeeId: id,
          employeeName: name,
          payments: [],
          handovers: [],
          dayMap: new Map(),
        };
        byEmployee.set(id, acc);
      }
      return acc;
    };

    for (const p of payments) {
      if (!p.collectedByUserId || !p.collectedBy) continue;
      const acc = ensure(p.collectedByUserId, p.collectedBy.name);
      const amt = moneyString(p.amount);
      acc.payments.push(amt);
      const day = dateToIsoDate(p.paidAt);
      const prev = acc.dayMap.get(day) ?? { collected: "0.00", handedOver: "0.00" };
      acc.dayMap.set(day, {
        collected: addMoney(prev.collected, amt),
        handedOver: prev.handedOver,
      });
    }

    for (const h of handovers) {
      const acc = ensure(h.employeeId, h.employee.name);
      const amt = moneyString(h.amount);
      acc.handovers.push(amt);
      const day = dateToIsoDate(h.handedOverAt);
      const prev = acc.dayMap.get(day) ?? { collected: "0.00", handedOver: "0.00" };
      acc.dayMap.set(day, {
        collected: prev.collected,
        handedOver: addMoney(prev.handedOver, amt),
      });
    }

    const employees = [...byEmployee.values()].map((acc) => {
      const totals = computeEmployeeCash({
        payments: acc.payments,
        handovers: acc.handovers,
      });
      const days = [...acc.dayMap.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([date, v]) => ({
          date,
          collected: v.collected,
          handedOver: v.handedOver,
        }));
      return {
        employeeId: acc.employeeId,
        employeeName: acc.employeeName,
        ...totals,
        days,
      };
    });

    employees.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "bg"));

    return { employees };
  }

  async enqueueReminder(
    user: AuthRequestUser,
    invoiceId: string,
    body: ReminderSendBody = {},
  ): Promise<EmailEnqueueResult> {
    this.assertCan(user, "sendReminder", "Invoice");

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        dueDate: true,
        grossAmount: true,
        clientEmail: true,
        clientLegalName: true,
        number: true,
      },
    });
    if (!invoice) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new AppException(ErrorCode.INVOICE_NOT_ISSUED, "Invoice is not issued");
    }

    const paidSum = await this.paidSumForInvoice(invoiceId);
    const outstanding = computeOutstanding(moneyString(invoice.grossAmount), [
      paidSum,
    ]);
    const asOf = todayInSofia(new Date());
    const dueDate = invoice.dueDate ? dateToIsoDate(invoice.dueDate) : null;
    const classification = classifyInvoice({
      status: invoice.status,
      dueDate,
      outstanding,
      asOf,
    });

    if (
      classification !== InvoicePaymentClassification.OVERDUE &&
      body.force !== true
    ) {
      throw new AppException(
        ErrorCode.REMINDER_INVOICE_NOT_OVERDUE,
        "Invoice is not overdue",
        { classification },
      );
    }

    const to = (invoice.clientEmail ?? "").trim();
    if (!to) {
      throw new AppException(
        ErrorCode.REMINDER_NO_EMAIL,
        "Client email missing on invoice snapshot",
      );
    }

    const prior = await this.prisma.emailEvent.count({
      where: { invoiceId, kind: EmailEventKind.REMINDER },
    });
    const attempt = prior + 1;
    const deterministicJobId = jobId("invoice_reminder", invoiceId, attempt);
    const emailEventId = createId();

    try {
      await this.prisma.emailEvent.create({
        data: {
          id: emailEventId,
          invoiceId,
          kind: EmailEventKind.REMINDER,
          toAddress: to,
          jobId: deterministicJobId,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/email_events_job_id|unique|P2002/i.test(msg)) {
        return { jobId: deterministicJobId };
      }
      throw new AppException(ErrorCode.EMAIL_ENQUEUE_FAILED, "Failed to record reminder event");
    }

    try {
      await this.reminderQueue.add(
        PAYMENT_REMINDER_JOB,
        { invoiceId, emailEventId, to, attempt },
        { jobId: deterministicJobId },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/already exists|JobId|duplicat/i.test(msg)) {
        return { jobId: deterministicJobId };
      }
      throw new AppException(ErrorCode.EMAIL_ENQUEUE_FAILED, "Failed to enqueue reminder");
    }

    return { jobId: deterministicJobId };
  }

  async listReminderEvents(
    user: AuthRequestUser,
    invoiceId: string,
  ): Promise<EmailEventList> {
    this.assertCan(user, "read", "Invoice");
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!invoice) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    const rows = await this.prisma.emailEvent.findMany({
      where: { invoiceId, kind: EmailEventKind.REMINDER },
      orderBy: { createdAt: "desc" },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoiceId,
        notificationId: row.notificationId,
        kind: row.kind,
        toAddress: row.toAddress,
        sentAt: row.sentAt?.toISOString() ?? null,
        failedAt: row.failedAt?.toISOString() ?? null,
        error: row.error,
        jobId: row.jobId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
