import {
  AgreementStatus,
  ClientKind,
  createId,
  EmployeeRoleOnVisit,
  InvoiceStatus,
  NotificationKind,
  Role,
  ServiceType,
  SiteStatus,
  VisitStatus,
  jobId,
} from "@ddcrm/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { isoDateToDate } from "../src/common/date-string";
import { deliverNotificationEmail } from "../src/notifications/deliver-notification-email";
import { NotificationSweepService } from "../src/notifications/notification-sweep.service";
import { NOTIFICATION_SYSTEM_LABEL } from "../src/notifications/system-actor";
import { startAuthTestApp, stopAuthTestApp, type AuthTestContext } from "./helpers/auth-app";

const AS_OF = "2026-06-15";
const NEXT_DAY = "2026-06-16";
const evidenceDir = resolve(process.cwd(), "../../docs/evidence/task-20");

describe("notification sweep (Task 20)", () => {
  let ctx: AuthTestContext;
  let adminId: string;
  let officeId: string;
  let fieldId: string;

  beforeAll(async () => {
    ctx = await startAuthTestApp();
    mkdirSync(evidenceDir, { recursive: true });
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  beforeEach(async () => {
    await ctx.db.resetDb();
    adminId = createId();
    officeId = createId();
    fieldId = createId();
    const passwordHash = await hashPassword("Password1!");
    const areaId = createId();
    const siteTypeId = createId();
    const siteId = createId();
    const yesClient = createId();
    const noClient = createId();

    await ctx.db.prisma.area.create({ data: { id: areaId, name: "A", isActive: true } });
    await ctx.db.prisma.siteType.create({ data: { id: siteTypeId, name: "T", isActive: true } });
    for (const user of [
      { id: adminId, email: "admin-sweep@test.local", role: Role.ADMIN },
      { id: officeId, email: "office-sweep@test.local", role: Role.OFFICE },
      { id: fieldId, email: "field-sweep@test.local", role: Role.FIELD },
    ]) {
      await ctx.db.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.role,
          role: user.role,
          passwordHash,
          passwordChangedAt: new Date(),
        },
      });
    }

    await ctx.db.prisma.client.create({
      data: {
        id: yesClient,
        kind: ClientKind.COMPANY,
        name: "Notify Yes",
        nameNormalized: "notify yes",
        eik: "175074752",
        email: "yes-client@test.local",
        notifyByEmail: true,
        isActive: true,
      },
    });
    await ctx.db.prisma.client.create({
      data: {
        id: noClient,
        kind: ClientKind.COMPANY,
        name: "Notify No",
        nameNormalized: "notify no",
        eik: "131134023",
        email: "no-client@test.local",
        notifyByEmail: false,
        isActive: true,
      },
    });
    await ctx.db.prisma.site.create({
      data: {
        id: siteId,
        clientId: yesClient,
        areaId,
        siteTypeId,
        name: "Кухня",
        address: "ул. Тест 1",
        status: SiteStatus.ACTIVE,
      },
    });

    const employeeId = createId();
    await ctx.db.prisma.clientEmployee.create({
      data: {
        id: employeeId,
        clientId: yesClient,
        siteId,
        fullName: "Служител",
        jobTitle: "Готвач",
        createdById: officeId,
      },
    });

    const certDays = [30, 14, 7, 29, 15, 8];
    for (const days of certDays) {
      const expires = new Date(`${AS_OF}T00:00:00.000Z`);
      expires.setUTCDate(expires.getUTCDate() + days);
      const last = new Date(expires);
      last.setUTCFullYear(last.getUTCFullYear() - 1);
      await ctx.db.prisma.healthCertificate.create({
        data: {
          id: createId(),
          clientEmployeeId: employeeId,
          lastCertifiedAt: last,
          nextRenewalAt: expires,
          createdById: officeId,
        },
      });
    }

    for (const client of [
      { id: yesClient, site: siteId },
      { id: noClient, site: siteId },
    ]) {
      await ctx.db.prisma.agreement.create({
        data: {
          id: createId(),
          clientId: client.id,
          siteId: client.site,
          serviceType: ServiceType.DISINFECTION,
          signedAt: isoDateToDate("2026-01-01"),
          expiresAt: isoDateToDate("2026-07-15"),
          contractValue: "100.00",
          status: AgreementStatus.ACTIVE,
          createdById: officeId,
        },
      });
    }

    const visitId = createId();
    await ctx.db.prisma.visit.create({
      data: {
        id: visitId,
        siteId,
        visitDate: isoDateToDate("2026-06-01"),
        treatmentType: ServiceType.DISINFECTION,
        chargedAmount: "50.00",
        rateIncludesVat: true,
        status: VisitStatus.ACTIVE,
        createdById: fieldId,
        clientMutationId: createId(),
        employees: {
          create: {
            id: createId(),
            userId: fieldId,
            roleOnVisit: EmployeeRoleOnVisit.LEAD,
          },
        },
      },
    });
    await ctx.db.prisma.foodSamplingSchedule.create({
      data: {
        id: createId(),
        siteId,
        serviceType: ServiceType.DISINFECTION,
        cadenceMonths: 3,
        nextDueAt: isoDateToDate(AS_OF),
        active: true,
        createdById: officeId,
      },
    });

    await ctx.db.prisma.invoice.create({
      data: {
        id: createId(),
        number: "0000000099",
        status: InvoiceStatus.ISSUED,
        documentType: "INVOICE",
        clientId: yesClient,
        issuedAt: new Date("2026-05-01T08:00:00.000Z"),
        issuedById: officeId,
        billingMonth: isoDateToDate("2026-05-01"),
        dueDate: isoDateToDate("2026-06-01"),
        clientLegalName: "Notify Yes",
        clientEik: "175074752",
        clientVatNumber: "BG175074752",
        clientRegisteredAddress: "София",
        clientLegalRepresentative: "Иван",
        grossAmount: "120.00",
        netAmount: "100.00",
        vatAmount: "20.00",
        createdById: officeId,
      },
    });
  });

  function sweep() {
    return ctx.app.get(NotificationSweepService);
  }

  it("creates exact-day notifications once, gates client email, and does not repeat overdue", async () => {
    const firstEmails: Array<{ notificationId: string; to: string }> = [];
    const first = await sweep().run(AS_OF, async (emails) => {
      firstEmails.push(...emails);
    });
    expect(first.created).toBe(firstEmails.length);

    const rows = await ctx.db.prisma.notification.findMany();
    const certs = rows.filter((r) => r.kind === NotificationKind.CERTIFICATE_EXPIRING);
    expect(certs).toHaveLength(6);
    expect(certs.filter((r) => r.thresholdDay === 7).every((r) => r.priority === "HIGH")).toBe(true);
    expect(certs.filter((r) => r.thresholdDay === 30).every((r) => r.priority === "NORMAL")).toBe(true);

    const clientRows = rows.filter((r) => r.recipientType === "CLIENT_CONTACT");
    expect(clientRows).toHaveLength(1);
    expect(clientRows[0]?.bodyI18nKey).toBe("clientBody.AGREEMENT_EXPIRING");
    expect(firstEmails.filter((e) => e.to === "yes-client@test.local")).toHaveLength(1);
    expect(firstEmails.filter((e) => e.to === "no-client@test.local")).toHaveLength(0);

    const food = rows.filter((r) => r.kind === NotificationKind.FOOD_SCHEDULE_DUE);
    expect(food.map((r) => r.recipientUserId).sort()).toEqual([fieldId, officeId].sort());
    expect(food.some((r) => r.recipientUserId === adminId)).toBe(false);

    const overdue = rows.filter((r) => r.kind === NotificationKind.INVOICE_OVERDUE);
    expect(overdue).toHaveLength(2);
    expect(overdue.every((r) => r.thresholdDay === 0 && r.priority === "HIGH")).toBe(true);

    const before = rows.length;
    const secondEmails: Array<{ notificationId: string }> = [];
    await sweep().run(AS_OF, async (emails) => {
      secondEmails.push(...emails);
    });
    const afterSameDay = await ctx.db.prisma.notification.count();
    expect(afterSameDay).toBe(before);
    expect(secondEmails).toHaveLength(0);

    const creates = await ctx.db.prisma.auditLog.findMany({
      where: { entityType: "notifications", action: "CREATE" },
    });
    expect(creates.length).toBe(before);
    expect(
      creates.every(
        (row) =>
          row.source === "system" &&
          row.actorUserId === null &&
          row.actorLabel === NOTIFICATION_SYSTEM_LABEL,
      ),
    ).toBe(true);

    await sweep().run(NEXT_DAY, async () => undefined);
    const afterNextDay = await ctx.db.prisma.notification.count({
      where: { kind: NotificationKind.INVOICE_OVERDUE },
    });
    expect(afterNextDay).toBe(2);

    expect(jobId("notification_email", clientRows[0]!.id)).toBe(
      `notification_email_${clientRows[0]!.id}`,
    );

    writeFileSync(
      resolve(evidenceDir, "sweep-evidence.json"),
      JSON.stringify(
        {
          asOf: AS_OF,
          firstRunRows: before,
          secondRunSameDayAdded: afterSameDay - before,
          secondRunEmails: secondEmails.length,
          clientContactRows: clientRows.length,
          clientEmailTo: firstEmails.filter((e) => e.to === "yes-client@test.local").length,
          noNotifyClientEmails: firstEmails.filter((e) => e.to === "no-client@test.local").length,
          overdueAfterNextDay: afterNextDay,
          systemActor: NOTIFICATION_SYSTEM_LABEL,
        },
        null,
        2,
      ),
    );
  });

  it("SMTP failure leaves the notification and records the email failure, then a retry sends", async () => {
    const emails: Array<{ notificationId: string; to: string }> = [];
    await sweep().run(AS_OF, async (batch) => {
      emails.push(...batch);
    });
    const target = emails.find((e) => e.to === "office-sweep@test.local");
    expect(target).toBeTruthy();
    const before = await ctx.db.prisma.notification.findUnique({
      where: { id: target!.notificationId },
    });
    const eventId = createId();
    await ctx.db.prisma.emailEvent.create({
      data: {
        id: eventId,
        notificationId: target!.notificationId,
        kind: "NOTIFICATION",
        toAddress: target!.to,
        jobId: jobId("notification_email", target!.notificationId),
      },
    });

    await expect(
      deliverNotificationEmail({
        prisma: ctx.db.prisma as never,
        mail: {
          send: async () => {
            throw new Error("smtp down");
          },
        },
        data: { notificationId: target!.notificationId, emailEventId: eventId, to: target!.to },
        actorLabel: "worker:notifications:send-notification-email",
      }),
    ).rejects.toThrow(/smtp down/);

    const failed = await ctx.db.prisma.emailEvent.findUnique({ where: { id: eventId } });
    const still = await ctx.db.prisma.notification.findUnique({
      where: { id: target!.notificationId },
    });
    expect(failed?.failedAt).not.toBeNull();
    expect(failed?.error).toContain("smtp down");
    expect(still?.readAt).toEqual(before?.readAt ?? null);
    expect(still?.dismissedAt).toBeNull();

    await deliverNotificationEmail({
      prisma: ctx.db.prisma as never,
      mail: { send: async () => undefined },
      data: { notificationId: target!.notificationId, emailEventId: eventId, to: target!.to },
      actorLabel: "worker:notifications:send-notification-email",
    });
    const sent = await ctx.db.prisma.emailEvent.findUnique({ where: { id: eventId } });
    expect(sent?.sentAt).not.toBeNull();
    expect(sent?.failedAt).toBeNull();
  });
});
