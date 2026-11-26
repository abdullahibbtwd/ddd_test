import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AgreementStatus,
  EmployeeRoleOnVisit,
  ErrorCode,
  EXPIRY_THRESHOLD_DAYS,
  InvoiceStatus,
  NotificationKind,
  NotificationRecipientType,
  Role,
  VisitStatus,
  compareMoney,
  computeOutstanding,
  createId,
  expiryTargetDate,
  notificationI18nKeys,
  notificationPriority,
  type NotificationBodyParams,
} from "@ddcrm/shared";
import { runWithActorContextAsync } from "../audit/actor-context";
import { AppException } from "../common/errors/app.exception";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { insertNotificationIgnoreDuplicate } from "../prisma/insert-notification";
import { PrismaService } from "../prisma/prisma.service";
import { notificationSystemActor } from "./system-actor";
import { RuleMisconfiguredError, assertRulesCoverKnownKinds, ruleFor } from "./rules";

export type PendingNotificationEmail = {
  notificationId: string;
  to: string;
};

type StaffUser = { id: string; email: string; role: string };

type SweepTx = Parameters<Parameters<PrismaService["transaction"]>[0]>[0];

/**
 * Four sweeps, each in its own transaction (the recipient batch for that kind).
 * Dedup is INSERT … ON CONFLICT DO NOTHING on the partial unique indexes.
 * Emails are not sent here — the caller enqueues them after the transaction commits.
 *
 * Overdue invoices are notified once (threshold_day = 0). A later day does not
 * create another row. Food schedules due today also use threshold_day = 0, so
 * a schedule notifies once for its lifetime under the current unique key
 * (the next cadence is a separate product decision — see NOTIFICATIONS.md).
 *
 * The HTTP /expiring endpoints are an inclusive window and use the live clock.
 * The sweep uses the same predicates (erased employees excluded, ACTIVE
 * agreements, due date strictly before asOf, outstanding > 0) narrowed to
 * the exact calendar day for expiries, with an injected asOf.
 */
@Injectable()
export class NotificationSweepService {
  private readonly logger = new Logger(NotificationSweepService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(
    asOf: string,
    enqueue: (emails: PendingNotificationEmail[]) => Promise<void>,
  ): Promise<{ created: number }> {
    try {
      assertRulesCoverKnownKinds();
    } catch (error) {
      if (error instanceof RuleMisconfiguredError) {
        this.logger.error(error.message);
        throw new AppException(
          ErrorCode.RULE_MISCONFIGURED,
          "Правилото за известия е конфигурирано неправилно.",
        );
      }
      throw error;
    }

    const staff = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.OFFICE, Role.FIELD] } },
      select: { id: true, email: true, role: true },
    });

    let created = 0;
    const steps: Array<(s: StaffUser[]) => Promise<PendingNotificationEmail[]>> = [
      (s) => this.sweepCertificates(asOf, s),
      (s) => this.sweepAgreements(asOf, s),
      (s) => this.sweepFood(asOf, s),
      (s) => this.sweepInvoices(asOf, s),
    ];
    for (const step of steps) {
      const emails = await step(staff);
      created += emails.length;
      await enqueue(emails);
    }
    return { created };
  }

  private async sweepCertificates(
    asOf: string,
    staff: StaffUser[],
  ): Promise<PendingNotificationEmail[]> {
    const rule = ruleFor(NotificationKind.CERTIFICATE_EXPIRING);
    const emails: PendingNotificationEmail[] = [];
    await runWithActorContextAsync(notificationSystemActor(), () =>
      this.prisma.transaction(async (tx) => {
        for (const threshold of EXPIRY_THRESHOLD_DAYS) {
          const target = expiryTargetDate(asOf, threshold);
          const certs = await tx.healthCertificate.findMany({
            where: {
              nextRenewalAt: isoDateToDate(target),
              clientEmployee: { erasedAt: null },
            },
            select: {
              id: true,
              nextRenewalAt: true,
              clientEmployee: {
                select: {
                  id: true,
                  siteId: true,
                  site: { select: { id: true, name: true } },
                },
              },
            },
          });
          for (const cert of certs as CertRow[]) {
            const siteId = cert.clientEmployee.site?.id ?? cert.clientEmployee.siteId;
            const params: NotificationBodyParams = {
              siteName: cert.clientEmployee.site?.name ?? "обект",
              expiresAt: dateToIsoDate(cert.nextRenewalAt),
              employeeId: cert.clientEmployee.id,
              entityId: cert.id,
              thresholdDay: threshold,
            };
            if (siteId) params.siteId = siteId;
            const added = await this.insertForUsers(tx, {
              kind: NotificationKind.CERTIFICATE_EXPIRING,
              entityType: "health_certificates",
              entityId: cert.id,
              thresholdDay: threshold,
              params,
              users: this.systemRecipients(rule, staff, []),
            });
            emails.push(...added);
          }
        }
      }),
    );
    return emails;
  }

  private async sweepAgreements(
    asOf: string,
    staff: StaffUser[],
  ): Promise<PendingNotificationEmail[]> {
    const rule = ruleFor(NotificationKind.AGREEMENT_EXPIRING);
    const emails: PendingNotificationEmail[] = [];
    await runWithActorContextAsync(notificationSystemActor(), () =>
      this.prisma.transaction(async (tx) => {
        for (const threshold of EXPIRY_THRESHOLD_DAYS) {
          const target = expiryTargetDate(asOf, threshold);
          const rows = await tx.agreement.findMany({
            where: {
              status: AgreementStatus.ACTIVE,
              expiresAt: isoDateToDate(target),
            },
            select: {
              id: true,
              expiresAt: true,
              site: { select: { id: true, name: true } },
              client: { select: { id: true, email: true, notifyByEmail: true } },
            },
          });
          for (const row of rows as AgreementRow[]) {
            const params: NotificationBodyParams = {
              siteName: row.site.name,
              siteId: row.site.id,
              expiresAt: dateToIsoDate(row.expiresAt),
              entityId: row.id,
              thresholdDay: threshold,
            };
            const added = await this.insertForUsers(tx, {
              kind: NotificationKind.AGREEMENT_EXPIRING,
              entityType: "agreements",
              entityId: row.id,
              thresholdDay: threshold,
              params,
              users: this.systemRecipients(rule, staff, []),
            });
            emails.push(...added);
            if (rule.includeClientContact && row.client.notifyByEmail) {
              const inserted = await this.insertOne(tx, {
                kind: NotificationKind.AGREEMENT_EXPIRING,
                entityType: "agreements",
                entityId: row.id,
                thresholdDay: threshold,
                params,
                recipientType: NotificationRecipientType.CLIENT_CONTACT,
                recipientUserId: null,
                recipientClientId: row.client.id,
              });
              const to = (row.client.email ?? "").trim();
              if (inserted && to.length > 0) {
                emails.push({ notificationId: inserted, to });
              }
            }
          }
        }
      }),
    );
    return emails;
  }

  private async sweepFood(
    asOf: string,
    staff: StaffUser[],
  ): Promise<PendingNotificationEmail[]> {
    const rule = ruleFor(NotificationKind.FOOD_SCHEDULE_DUE);
    const emails: PendingNotificationEmail[] = [];
    const schedules = await this.prisma.foodSamplingSchedule.findMany({
      where: { active: true, nextDueAt: isoDateToDate(asOf) },
      select: {
        id: true,
        siteId: true,
        serviceType: true,
        nextDueAt: true,
        site: { select: { id: true, name: true } },
      },
    });
    const leads = new Map<string, string[]>();
    for (const schedule of schedules) {
      if (!leads.has(schedule.siteId)) {
        leads.set(schedule.siteId, await this.leadUserIds(schedule.siteId));
      }
    }
    await runWithActorContextAsync(notificationSystemActor(), () =>
      this.prisma.transaction(async (tx) => {
        for (const schedule of schedules) {
          const params: NotificationBodyParams = {
            siteName: schedule.site.name,
            siteId: schedule.site.id,
            dueDate: dateToIsoDate(schedule.nextDueAt),
            serviceType: schedule.serviceType,
            entityId: schedule.id,
            thresholdDay: 0,
          };
          const added = await this.insertForUsers(tx, {
            kind: NotificationKind.FOOD_SCHEDULE_DUE,
            entityType: "food_sampling_schedules",
            entityId: schedule.id,
            thresholdDay: 0,
            params,
            users: this.systemRecipients(rule, staff, leads.get(schedule.siteId) ?? []),
          });
          emails.push(...added);
        }
      }),
    );
    return emails;
  }

  private async sweepInvoices(
    asOf: string,
    staff: StaffUser[],
  ): Promise<PendingNotificationEmail[]> {
    const rule = ruleFor(NotificationKind.INVOICE_OVERDUE);
    const emails: PendingNotificationEmail[] = [];
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.ISSUED,
        documentType: "INVOICE",
        dueDate: { lt: isoDateToDate(asOf) },
      },
      select: {
        id: true,
        number: true,
        dueDate: true,
        grossAmount: true,
        payments: { select: { amount: true } },
      },
    });
    const overdue = invoices.filter((invoice) => {
      if (!invoice.dueDate) return false;
      const paid = invoice.payments.map((p) => Number(p.amount).toFixed(2));
      const outstanding = computeOutstanding(Number(invoice.grossAmount).toFixed(2), paid);
      return compareMoney(outstanding, "0.00") > 0;
    });
    await runWithActorContextAsync(notificationSystemActor(), () =>
      this.prisma.transaction(async (tx) => {
        for (const invoice of overdue) {
          const params: NotificationBodyParams = {
            invoiceNumber: invoice.number ?? invoice.id,
            dueDate: dateToIsoDate(invoice.dueDate!),
            entityId: invoice.id,
            thresholdDay: 0,
          };
          const added = await this.insertForUsers(tx, {
            kind: NotificationKind.INVOICE_OVERDUE,
            entityType: "invoices",
            entityId: invoice.id,
            thresholdDay: 0,
            params,
            users: this.systemRecipients(rule, staff, []),
          });
          emails.push(...added);
        }
      }),
    );
    return emails;
  }

  private async leadUserIds(siteId: string): Promise<string[]> {
    const visit = await this.prisma.visit.findFirst({
      where: { siteId, status: VisitStatus.ACTIVE },
      orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
      select: {
        employees: {
          where: { roleOnVisit: EmployeeRoleOnVisit.LEAD },
          select: { userId: true },
        },
      },
    });
    return visit?.employees.map((e) => e.userId) ?? [];
  }

  private systemRecipients(
    rule: ReturnType<typeof ruleFor>,
    staff: StaffUser[],
    leadIds: string[],
  ): StaffUser[] {
    const out = new Map<string, StaffUser>();
    for (const user of staff) {
      if (rule.systemRoles.includes(user.role as "ADMIN" | "OFFICE")) {
        out.set(user.id, user);
      }
    }
    if (rule.includeFieldLead) {
      for (const id of leadIds) {
        const user = staff.find((u) => u.id === id);
        if (user) out.set(user.id, user);
      }
    }
    return [...out.values()];
  }

  private async insertForUsers(
    tx: SweepTx,
    input: {
      kind: (typeof NotificationKind)[keyof typeof NotificationKind];
      entityType: string;
      entityId: string;
      thresholdDay: number;
      params: NotificationBodyParams;
      users: StaffUser[];
    },
  ): Promise<PendingNotificationEmail[]> {
    const emails: PendingNotificationEmail[] = [];
    for (const user of input.users) {
      const inserted = await this.insertOne(tx, {
        ...input,
        recipientType: NotificationRecipientType.SYSTEM_USER,
        recipientUserId: user.id,
        recipientClientId: null,
      });
      if (inserted && user.email.trim().length > 0) {
        emails.push({ notificationId: inserted, to: user.email.trim() });
      }
    }
    return emails;
  }

  private async insertOne(
    tx: SweepTx,
    input: {
      kind: (typeof NotificationKind)[keyof typeof NotificationKind];
      entityType: string;
      entityId: string;
      thresholdDay: number;
      params: NotificationBodyParams;
      recipientType: (typeof NotificationRecipientType)[keyof typeof NotificationRecipientType];
      recipientUserId: string | null;
      recipientClientId: string | null;
    },
  ): Promise<string | null> {
    const keys = notificationI18nKeys(input.kind, input.recipientType);
    return insertNotificationIgnoreDuplicate(
      (strings, ...values) => tx.$queryRaw(strings, ...values),
      {
        id: createId(),
        recipientUserId: input.recipientUserId,
        recipientClientId: input.recipientClientId,
        recipientType: input.recipientType,
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        thresholdDay: input.thresholdDay,
        priority: notificationPriority(input.kind, input.thresholdDay),
        titleI18nKey: keys.titleI18nKey,
        bodyI18nKey: keys.bodyI18nKey,
        bodyParams: input.params,
      },
    );
  }
}

type CertRow = {
  id: string;
  nextRenewalAt: Date;
  clientEmployee: {
    id: string;
    siteId: string | null;
    site: { id: string; name: string } | null;
  };
};

type AgreementRow = {
  id: string;
  expiresAt: Date;
  site: { id: string; name: string };
  client: { id: string; email: string | null; notifyByEmail: boolean };
};
