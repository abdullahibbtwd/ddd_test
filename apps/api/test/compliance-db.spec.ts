import { createId } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

describe("compliance DB constraints (Task 19)", () => {
  let db: TestDb;
  let userId: string;
  let clientId: string;
  let areaId: string;
  let siteTypeId: string;
  let siteId: string;
  let employeeId: string;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
    userId = createId();
    clientId = createId();
    areaId = createId();
    siteTypeId = createId();
    siteId = createId();
    employeeId = createId();
    const passwordHash = await hashPassword("test-password-ok");

    await db.prisma.user.create({
      data: {
        id: userId,
        email: "p10@test.local",
        name: "Admin",
        role: "ADMIN",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await db.prisma.area.create({
      data: { id: areaId, name: "Area-P10", isActive: true },
    });
    await db.prisma.siteType.create({
      data: { id: siteTypeId, name: "Type-P10", isActive: true },
    });
    await db.prisma.client.create({
      data: {
        id: clientId,
        kind: "COMPANY",
        name: "Client P10",
        nameNormalized: "client p10",
        eik: "175074752",
        isActive: true,
      },
    });
    await db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId,
        name: "Site P10",
        address: "ул. Тест 1",
        monitoringPointsCount: 0,
        status: "ACTIVE",
      },
    });
    await db.prisma.clientEmployee.create({
      data: {
        id: employeeId,
        clientId,
        siteId,
        fullName: "Иван Петров",
        jobTitle: "Готвач",
        createdById: userId,
      },
    });
  });

  it("erasure CHECK rejects partial erasure (name not replaced)", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- CHECK constraint proof
      db.prisma.$executeRawUnsafe(
        `UPDATE client_employees SET erased_at = now(), erased_by = $1::uuid, erase_reason = 'достатъчно', full_name = 'Иван' WHERE id = $2::uuid`,
        userId,
        employeeId,
      ),
    ).rejects.toThrow();
  });

  it("erasure CHECK rejects missing reason", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- CHECK constraint proof
      db.prisma.$executeRawUnsafe(
        `UPDATE client_employees SET erased_at = now(), erased_by = $1::uuid, erase_reason = 'ab', full_name = '[изтрито]', job_title = '[изтрито]' WHERE id = $2::uuid`,
        userId,
        employeeId,
      ),
    ).rejects.toThrow();
  });

  it("erasure CHECK accepts full anonymized row", async () => {
    // eslint-disable-next-line no-restricted-syntax -- CHECK constraint proof
    await db.prisma.$executeRawUnsafe(
      `UPDATE client_employees SET erased_at = now(), erased_by = $1::uuid, erase_reason = 'GDPR заявка', full_name = '[изтрито]', job_title = '[изтрито]', notes = NULL WHERE id = $2::uuid`,
      userId,
      employeeId,
    );
    const row = await db.prisma.clientEmployee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    expect(row.fullName).toBe("[изтрито]");
    expect(row.jobTitle).toBe("[изтрито]");
    expect(row.erasedAt).not.toBeNull();
  });

  it("certificate CHECK nextRenewalAt > lastCertifiedAt", async () => {
    await expect(
      db.prisma.healthCertificate.create({
        data: {
          id: createId(),
          clientEmployeeId: employeeId,
          lastCertifiedAt: new Date("2026-06-01"),
          nextRenewalAt: new Date("2026-06-01"),
          createdById: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("agreement CHECK expires > signed", async () => {
    await expect(
      db.prisma.agreement.create({
        data: {
          id: createId(),
          clientId,
          siteId,
          serviceType: "INSECT_CONTROL",
          signedAt: new Date("2026-01-01"),
          expiresAt: new Date("2026-01-01"),
          contractValue: "100.00",
          status: "ACTIVE",
          createdById: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("partial UNIQUE on previous_agreement_id rejects second renewal", async () => {
    const firstId = createId();
    await db.prisma.agreement.create({
      data: {
        id: firstId,
        clientId,
        siteId,
        serviceType: "INSECT_CONTROL",
        signedAt: new Date("2025-01-01"),
        expiresAt: new Date("2026-01-01"),
        contractValue: "100.00",
        status: "RENEWED",
        createdById: userId,
      },
    });
    await db.prisma.agreement.create({
      data: {
        id: createId(),
        clientId,
        siteId,
        serviceType: "INSECT_CONTROL",
        signedAt: new Date("2026-01-01"),
        expiresAt: new Date("2027-01-01"),
        contractValue: "100.00",
        status: "ACTIVE",
        previousAgreementId: firstId,
        createdById: userId,
      },
    });
    await expect(
      db.prisma.agreement.create({
        data: {
          id: createId(),
          clientId,
          siteId,
          serviceType: "INSECT_CONTROL",
          signedAt: new Date("2026-02-01"),
          expiresAt: new Date("2027-02-01"),
          contractValue: "100.00",
          status: "ACTIVE",
          previousAgreementId: firstId,
          createdById: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("food record CHECK result_received_at required for non-PENDING", async () => {
    await expect(
      db.prisma.foodSampleRecord.create({
        data: {
          id: createId(),
          siteId,
          collectedAt: new Date("2026-11-01"),
          sampleDescription: "Проба вода",
          resultStatus: "CONFORMING",
          resultReceivedAt: null,
          createdById: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("food record trigger advances next_due_at after insert", async () => {
    const scheduleId = createId();
    await db.prisma.foodSamplingSchedule.create({
      data: {
        id: scheduleId,
        siteId,
        serviceType: "DISINFECTION",
        cadenceMonths: 3,
        nextDueAt: new Date("2026-11-01"),
        active: true,
        createdById: userId,
      },
    });
    await db.prisma.foodSampleRecord.create({
      data: {
        id: createId(),
        scheduleId,
        siteId,
        collectedAt: new Date("2026-11-01"),
        sampleDescription: "Проба храна",
        resultStatus: "PENDING",
        createdById: userId,
      },
    });
    const schedule = await db.prisma.foodSamplingSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    });
    expect(schedule.nextDueAt.toISOString().slice(0, 10)).toBe("2027-02-01");
  });

  it("DELETE is rejected on compliance tables (23P06)", async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- no-DELETE trigger proof
      db.prisma.$executeRawUnsafe(
        `DELETE FROM client_employees WHERE id = $1::uuid`,
        employeeId,
      ),
    ).rejects.toThrow(/23P06|no hard delete/i);

    const certId = createId();
    await db.prisma.healthCertificate.create({
      data: {
        id: certId,
        clientEmployeeId: employeeId,
        lastCertifiedAt: new Date("2026-01-01"),
        nextRenewalAt: new Date("2026-07-01"),
        createdById: userId,
      },
    });
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- no-DELETE trigger proof
      db.prisma.$executeRawUnsafe(
        `DELETE FROM health_certificates WHERE id = $1::uuid`,
        certId,
      ),
    ).rejects.toThrow(/23P06|no hard delete/i);
  });
});
