import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS_VARIANTS, StatusBadge } from "@/components/status-badge";

const EXPECTED_CLASSES: Record<(typeof STATUS_VARIANTS)[number], string[]> = {
  ok: ["bg-ok-bg", "text-ok-ink"],
  warn: ["bg-warn-bg", "text-warn-ink"],
  bad: ["bg-bad-bg", "text-bad-ink"],
  neutral: ["bg-neutral-bg", "text-neutral-ink"],
};

describe("StatusBadge", () => {
  it("covers exactly the four variants", () => {
    expect([...STATUS_VARIANTS]).toEqual(["ok", "warn", "bad", "neutral"]);
  });

  for (const variant of STATUS_VARIANTS) {
    it(`renders the ${variant} variant as a pill with its tokens`, () => {
      render(<StatusBadge variant={variant}>{variant}</StatusBadge>);
      const badge = screen.getByText(variant);
      expect(badge).toHaveAttribute("data-variant", variant);
      expect(badge).toHaveClass("rounded-full", ...EXPECTED_CLASSES[variant]);
    });
  }
});
