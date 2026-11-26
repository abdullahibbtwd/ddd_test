import { describe, expect, it } from "vitest";
import { QUEUE_NAMES, jobId } from "../src/queues";

describe("queues", () => {
  it("exposes the expected queue names", () => {
    expect(QUEUE_NAMES).toEqual({
      DEFAULT: "default",
      EMAIL: "email",
      PDF: "pdf",
      NOTIFICATIONS: "notifications",
      INVOICE_EMAIL: "invoice-email",
      PAYMENT_REMINDER: "payment-reminder",
    });
  });

  it("builds deterministic job ids from parts with underscore", () => {
    expect(jobId("invoice-email", "abc")).toBe("invoice-email_abc");
    expect(jobId("cert-reminder", "abc", 30)).toBe("cert-reminder_abc_30");
  });

  it("rejects empty job id parts", () => {
    expect(() => jobId()).toThrow(/at least one part/);
    expect(() => jobId("ok", "")).toThrow(/must not be empty/);
  });

  it("rejects parts that contain ':'", () => {
    expect(() => jobId("a:b", "c")).toThrow(/must not contain/);
  });
});
