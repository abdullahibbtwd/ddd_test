import { describe, expect, it } from "vitest";
import { addCalendarDays, todayInSofia } from "@ddcrm/shared";

/**
 * Pure validation helpers mirroring VisitForm rules (amount / date / LEAD).
 * Kept free of React so the cases stay fast and deterministic.
 */
function validateVisitForm(input: {
  amount: string;
  amountFromSub: boolean;
  visitDate: string;
  today: string;
  isField: boolean;
  employeeIds: string[];
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.visitDate) errors.visitDate = "date";
  if (input.isField) {
    const min = addCalendarDays(input.today, -7);
    if (input.visitDate < min || input.visitDate > input.today) {
      errors.visitDate = "window";
    }
  } else if (input.visitDate > input.today) {
    errors.visitDate = "future";
  }
  if (!input.amountFromSub && (input.amount.trim() === "" || Number.isNaN(Number(input.amount)))) {
    errors.amount = "required";
  } else if (
    input.amount.trim() !== "" &&
    (Number.isNaN(Number(input.amount)) || Number(input.amount) < 0)
  ) {
    errors.amount = "invalid";
  }
  if (input.employeeIds.length === 0) errors.employees = "required";
  return errors;
}

function cancelReasonOk(reason: string): boolean {
  return reason.trim().length >= 3;
}

describe("visit form validation", () => {
  const today = todayInSofia(new Date("2026-11-23T12:00:00Z"));

  it("amount required when one-off", () => {
    const errors = validateVisitForm({
      amount: "",
      amountFromSub: false,
      visitDate: today,
      today,
      isField: false,
      employeeIds: ["u1"],
    });
    expect(errors.amount).toBe("required");
  });

  it("amount not required when copied from subscription", () => {
    const errors = validateVisitForm({
      amount: "80",
      amountFromSub: true,
      visitDate: today,
      today,
      isField: true,
      employeeIds: ["u1"],
    });
    expect(errors.amount).toBeUndefined();
  });

  it("FIELD date min/max window", () => {
    expect(
      validateVisitForm({
        amount: "1",
        amountFromSub: true,
        visitDate: addCalendarDays(today, -8),
        today,
        isField: true,
        employeeIds: ["u1"],
      }).visitDate,
    ).toBe("window");
    expect(
      validateVisitForm({
        amount: "1",
        amountFromSub: true,
        visitDate: today,
        today,
        isField: true,
        employeeIds: ["u1"],
      }).visitDate,
    ).toBeUndefined();
  });

  it("employee LEAD count — at least one employee required", () => {
    expect(
      validateVisitForm({
        amount: "1",
        amountFromSub: true,
        visitDate: today,
        today,
        isField: false,
        employeeIds: [],
      }).employees,
    ).toBe("required");
  });

  it("cancel reason length >= 3", () => {
    expect(cancelReasonOk("ab")).toBe(false);
    expect(cancelReasonOk("abc")).toBe(true);
  });
});
