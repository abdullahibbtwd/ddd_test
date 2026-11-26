import { describe, expect, it } from "vitest";
import { todayInSofia } from "./dates";
import { addCalendarDays } from "./visit-windows";
import {
  NotificationKind,
  NotificationListQuerySchema,
  NotificationPriority,
  NotificationRecipientType,
  buildBodyParams,
  expiryTargetDate,
  notificationI18nKeys,
  notificationPriority,
  notificationTargetPath,
  shouldNotifyExpiring,
} from "./notifications";

const AS_OF = "2026-06-15";

describe("shouldNotifyExpiring", () => {
  it("matches exactly 30, 14, and 7 calendar days", () => {
    for (const days of [30, 14, 7]) {
      expect(
        shouldNotifyExpiring({
          expiresAt: expiryTargetDate(AS_OF, days),
          asOf: AS_OF,
          thresholdDays: days,
          alreadyNotifiedThresholds: [],
        }),
      ).toBe(true);
    }
  });

  it("rejects off-by-one days 29, 15, 8, and 6", () => {
    const cases: Array<[number, number]> = [
      [29, 30],
      [15, 14],
      [8, 7],
      [6, 7],
    ];
    for (const [actual, threshold] of cases) {
      expect(
        shouldNotifyExpiring({
          expiresAt: addCalendarDays(AS_OF, actual),
          asOf: AS_OF,
          thresholdDays: threshold,
          alreadyNotifiedThresholds: [],
        }),
      ).toBe(false);
    }
  });

  it("is false when that threshold was already notified", () => {
    expect(
      shouldNotifyExpiring({
        expiresAt: expiryTargetDate(AS_OF, 14),
        asOf: AS_OF,
        thresholdDays: 14,
        alreadyNotifiedThresholds: [14],
      }),
    ).toBe(false);
    expect(
      shouldNotifyExpiring({
        expiresAt: expiryTargetDate(AS_OF, 14),
        asOf: AS_OF,
        thresholdDays: 14,
        alreadyNotifiedThresholds: [30],
      }),
    ).toBe(true);
  });

  it("uses an asOf string from todayInSofia across the DST boundary", () => {
    // 2026-03-29 01:30Z is 04:30 Sofia after the spring-forward (03:00 → 04:00).
    const asOf = todayInSofia(new Date("2026-03-29T01:30:00Z"));
    expect(asOf).toBe("2026-03-29");
    const expiresAt = expiryTargetDate(asOf, 30);
    expect(
      shouldNotifyExpiring({
        expiresAt,
        asOf,
        thresholdDays: 30,
        alreadyNotifiedThresholds: [],
      }),
    ).toBe(true);
    expect(
      shouldNotifyExpiring({
        expiresAt: addCalendarDays(asOf, 29),
        asOf,
        thresholdDays: 30,
        alreadyNotifiedThresholds: [],
      }),
    ).toBe(false);
    // Autumn fall-back: 2026-10-25 00:30Z is still 03:30 Sofia (UTC+3);
    // 22:30Z is 00:30 on the 26th (UTC+2). The helper only sees the string.
    const beforeFallback = todayInSofia(new Date("2026-10-25T00:30:00Z"));
    const afterFallback = todayInSofia(new Date("2026-10-25T22:30:00Z"));
    expect(beforeFallback).toBe("2026-10-25");
    expect(afterFallback).toBe("2026-10-26");
    expect(
      shouldNotifyExpiring({
        expiresAt: expiryTargetDate(afterFallback, 7),
        asOf: afterFallback,
        thresholdDays: 7,
        alreadyNotifiedThresholds: [],
      }),
    ).toBe(true);
  });
});

describe("notificationPriority", () => {
  const thresholds = [30, 14, 7, 0];

  it("maps every kind × threshold", () => {
    for (const thresholdDay of thresholds) {
      expect(
        notificationPriority(NotificationKind.INVOICE_OVERDUE, thresholdDay),
      ).toBe(NotificationPriority.HIGH);
      expect(
        notificationPriority(NotificationKind.AGREEMENT_EXPIRING, thresholdDay),
      ).toBe(NotificationPriority.NORMAL);
      expect(
        notificationPriority(NotificationKind.FOOD_SCHEDULE_DUE, thresholdDay),
      ).toBe(NotificationPriority.NORMAL);
      expect(
        notificationPriority(NotificationKind.CERTIFICATE_EXPIRING, thresholdDay),
      ).toBe(thresholdDay === 7 ? NotificationPriority.HIGH : NotificationPriority.NORMAL);
    }
  });
});

describe("buildBodyParams", () => {
  it("keeps allowlisted keys and drops names, email, and unknown fields", () => {
    const params = buildBodyParams({
      bodyParams: {
        siteName: "Обект Център",
        expiresAt: "2026-07-15",
        thresholdDay: 30,
        entityId: "019a0000-0000-7000-8000-000000000001",
        fullName: "Иван Иванов",
        email: "ivan@example.com",
        egn: "0000000000",
        clientLegalName: "Фирма ЕООД",
      },
    });
    expect(params).toEqual({
      siteName: "Обект Център",
      expiresAt: "2026-07-15",
      thresholdDay: 30,
      entityId: "019a0000-0000-7000-8000-000000000001",
    });
    expect(params).not.toHaveProperty("fullName");
    expect(params).not.toHaveProperty("email");
  });

  it("returns an empty object for non-objects", () => {
    expect(buildBodyParams({ bodyParams: null })).toEqual({});
    expect(buildBodyParams({ bodyParams: "x" })).toEqual({});
  });
});

describe("notification targets and i18n keys", () => {
  it("maps kinds to click targets", () => {
    const employeeId = "019a0000-0000-7000-8000-0000000000aa";
    const siteId = "019a0000-0000-7000-8000-0000000000bb";
    const entityId = "019a0000-0000-7000-8000-0000000000cc";
    expect(
      notificationTargetPath({
        kind: NotificationKind.CERTIFICATE_EXPIRING,
        entityId,
        bodyParams: { employeeId, siteId },
      }),
    ).toBe(`/certificates?employeeId=${employeeId}&siteId=${siteId}`);
    expect(
      notificationTargetPath({
        kind: NotificationKind.AGREEMENT_EXPIRING,
        entityId,
        bodyParams: {},
      }),
    ).toBe(`/agreements?agreementId=${entityId}`);
    expect(
      notificationTargetPath({
        kind: NotificationKind.FOOD_SCHEDULE_DUE,
        entityId,
        bodyParams: {},
      }),
    ).toBe("/food");
    expect(
      notificationTargetPath({
        kind: NotificationKind.INVOICE_OVERDUE,
        entityId,
        bodyParams: {},
      }),
    ).toBe(`/invoices/${entityId}`);
  });

  it("uses the short client-contact body key for agreements", () => {
    expect(
      notificationI18nKeys(
        NotificationKind.AGREEMENT_EXPIRING,
        NotificationRecipientType.CLIENT_CONTACT,
      ).bodyI18nKey,
    ).toBe("clientBody.AGREEMENT_EXPIRING");
    expect(
      notificationI18nKeys(
        NotificationKind.AGREEMENT_EXPIRING,
        NotificationRecipientType.SYSTEM_USER,
      ).bodyI18nKey,
    ).toBe("kinds.AGREEMENT_EXPIRING.body");
  });
});

describe("NotificationListQuerySchema", () => {
  it("defaults unreadOnly to true and accepts false", () => {
    expect(NotificationListQuerySchema.parse({}).unreadOnly).toBe(true);
    expect(NotificationListQuerySchema.parse({ unreadOnly: "false" }).unreadOnly).toBe(false);
    expect(NotificationListQuerySchema.parse({ unreadOnly: "true" }).unreadOnly).toBe(true);
  });
});
