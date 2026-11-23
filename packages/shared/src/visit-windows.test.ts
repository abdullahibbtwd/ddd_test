import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  canFieldUserDateVisit,
  canFieldUserEditVisit,
  isFieldWindowErrorForDate,
  isFieldWindowErrorForEdit,
  VisitWindowErrorCode,
} from "./visit-windows";

describe("visit FIELD windows", () => {
  // Role checks are NOT these helpers' job — the API enforces FIELD vs OFFICE/ADMIN.
  // canFieldUser* return false for out-of-window dates/instants only.

  describe("canFieldUserDateVisit", () => {
    const today = "2026-11-23";

    it("FIELD may date a visit 7 days ago", () => {
      expect(canFieldUserDateVisit("2026-11-16", today)).toBe(true);
    });

    it("FIELD may date a visit today", () => {
      expect(canFieldUserDateVisit(today, today)).toBe(true);
    });

    it("FIELD may not date a visit 8 days ago", () => {
      expect(canFieldUserDateVisit("2026-11-15", today)).toBe(false);
    });

    it("FIELD may not date a visit tomorrow", () => {
      expect(canFieldUserDateVisit("2026-11-24", today)).toBe(false);
    });

    it("allows mid-window dates", () => {
      expect(canFieldUserDateVisit("2026-11-20", today)).toBe(true);
    });

    it("around spring DST 2026-03-29 — calendar dates only", () => {
      expect(canFieldUserDateVisit("2026-03-22", "2026-03-29")).toBe(true);
      expect(canFieldUserDateVisit("2026-03-21", "2026-03-29")).toBe(false);
      expect(canFieldUserDateVisit("2026-03-30", "2026-03-29")).toBe(false);
    });

    it("around autumn DST 2026-10-25 — calendar dates only", () => {
      expect(canFieldUserDateVisit("2026-10-18", "2026-10-25")).toBe(true);
      expect(canFieldUserDateVisit("2026-10-17", "2026-10-25")).toBe(false);
      expect(canFieldUserDateVisit("2026-10-26", "2026-10-25")).toBe(false);
    });
  });

  describe("canFieldUserEditVisit", () => {
    it("FIELD may edit 23h59m after creation", () => {
      const created = "2026-11-23T10:00:00.000Z";
      const now = "2026-11-24T09:59:00.000Z";
      expect(canFieldUserEditVisit(created, now)).toBe(true);
    });

    it("FIELD may not edit 24h01m after creation", () => {
      const created = "2026-11-23T10:00:00.000Z";
      const now = "2026-11-24T10:01:00.000Z";
      expect(canFieldUserEditVisit(created, now)).toBe(false);
    });

    it("allows exactly 24h", () => {
      const created = "2026-11-23T10:00:00.000Z";
      const now = "2026-11-24T10:00:00.000Z";
      expect(canFieldUserEditVisit(created, now)).toBe(true);
    });

    it("DST autumn: created 2026-10-24T22:00Z, now 2026-10-25T21:30Z — 23h30m allowed", () => {
      // Sat Sofia +3 → Sun Sofia +2; instant gap is what matters.
      expect(
        canFieldUserEditVisit(
          "2026-10-24T22:00:00.000Z",
          "2026-10-25T21:30:00.000Z",
        ),
      ).toBe(true);
    });

    it("DST autumn: created 2026-10-24T22:00Z, now 2026-10-25T22:30Z — 24h30m not allowed", () => {
      expect(
        canFieldUserEditVisit(
          "2026-10-24T22:00:00.000Z",
          "2026-10-25T22:30:00.000Z",
        ),
      ).toBe(false);
    });

    it("DST spring: 23h30m across 2026-03-29 still allowed", () => {
      expect(
        canFieldUserEditVisit(
          "2026-03-28T22:00:00.000Z",
          "2026-03-29T21:30:00.000Z",
        ),
      ).toBe(true);
    });

    it("DST spring: 24h30m across 2026-03-29 not allowed", () => {
      expect(
        canFieldUserEditVisit(
          "2026-03-28T22:00:00.000Z",
          "2026-03-29T22:30:00.000Z",
        ),
      ).toBe(false);
    });

    it("rejects now before created", () => {
      expect(
        canFieldUserEditVisit(
          "2026-11-23T10:00:00.000Z",
          "2026-11-23T09:00:00.000Z",
        ),
      ).toBe(false);
    });
  });

  describe("isFieldWindowError helpers", () => {
    it("returns VISIT_DATE_OUT_OF_WINDOW", () => {
      expect(isFieldWindowErrorForDate("2026-11-15", "2026-11-23")).toBe(
        VisitWindowErrorCode.VISIT_DATE_OUT_OF_WINDOW,
      );
      expect(isFieldWindowErrorForDate("2026-11-20", "2026-11-23")).toBeNull();
    });

    it("returns VISIT_EDIT_WINDOW_EXPIRED", () => {
      expect(
        isFieldWindowErrorForEdit(
          "2026-11-23T10:00:00.000Z",
          "2026-11-24T10:01:00.000Z",
        ),
      ).toBe(VisitWindowErrorCode.VISIT_EDIT_WINDOW_EXPIRED);
      expect(
        isFieldWindowErrorForEdit(
          "2026-11-23T10:00:00.000Z",
          "2026-11-24T09:59:00.000Z",
        ),
      ).toBeNull();
    });
  });

  describe("addCalendarDays", () => {
    it("rolls month boundaries", () => {
      expect(addCalendarDays("2026-11-01", -1)).toBe("2026-10-31");
      expect(addCalendarDays("2026-10-25", -7)).toBe("2026-10-18");
    });
  });
});
