import {
  computeLineTotal,
  formatInvoiceNumber,
  sumLines,
} from "@ddcrm/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import i18n from "@/i18n";
import { InvoiceForm } from "../-invoice-form";

vi.mock("@/api/generated/clients/clients", () => ({
  useClientsControllerList: () => ({
    data: {
      data: {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Тест Клиент ЕООД",
            eik: "175074752",
          },
        ],
      },
    },
    isFetching: false,
  }),
}));

vi.mock("@/api/generated/sites/sites", () => ({
  sitesControllerList: vi.fn(async () => ({ data: { items: [] } })),
}));

vi.mock("@/api/generated/visits/visits", () => ({
  visitsControllerList: vi.fn(async () => ({ data: { items: [] } })),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("invoice form + money helpers", () => {
  it("formatInvoiceNumber zero-pads to 10 digits", () => {
    expect(formatInvoiceNumber(1)).toBe("0000000001");
    expect(formatInvoiceNumber(42)).toBe("0000000042");
  });

  it("mixed VAT totals use sumLines (HALF_UP strings)", () => {
    const totals = sumLines([
      { amount: computeLineTotal("1", "100.00"), vatRate: "20.00" },
      { amount: computeLineTotal("1", "50.00"), vatRate: "9.00" },
      { amount: computeLineTotal("2", "10.00"), vatRate: "0.00" },
    ]);
    expect(totals.net).toBe("170.00");
    expect(totals.vat).toBe("24.50");
    expect(totals.gross).toBe("194.50");
  });

  it("adds and removes lines and updates totals", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <InvoiceForm
        mode="create"
        primaryLabel="Запази като чернова"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("invoice-form")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Добави ред" }));
    expect(screen.getAllByTestId("invoice-line-description")).toHaveLength(1);

    await user.clear(screen.getByTestId("invoice-line-unit-price"));
    await user.type(screen.getByTestId("invoice-line-unit-price"), "100");
    await user.clear(screen.getByTestId("invoice-line-description"));
    await user.type(screen.getByTestId("invoice-line-description"), "Услуга А");

    const totals = screen.getByTestId("invoice-totals");
    expect(totals.textContent).toMatch(/120/);

    await user.click(screen.getByRole("button", { name: "Добави ред" }));
    expect(screen.getAllByTestId("invoice-line-description")).toHaveLength(2);

    await user.click(screen.getAllByTestId("invoice-line-remove")[0]!);
    expect(screen.getAllByTestId("invoice-line-description")).toHaveLength(1);
  });

  it("ConfirmDialog issue copy matches i18n exactly", () => {
    const description = i18n.t("issueDescription", { ns: "invoices" });
    expect(description).toBe(
      "След издаване фактурата не може да се променя. Номерът ще бъде зададен при издаването.",
    );
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title={i18n.t("issueTitle", { ns: "invoices" })}
        description={description}
        confirmLabel={i18n.t("issueConfirm", { ns: "invoices" })}
        onConfirm={() => undefined}
      />,
    );
    expect(
      screen.getByText(
        "След издаване фактурата не може да се променя. Номерът ще бъде зададен при издаването.",
      ),
    ).toBeInTheDocument();
  });

  it("ISSUED read-only markup has no edit controls", () => {
    render(
      <div data-testid="invoice-issued">
        <span className="font-mono text-3xl">0000000001</span>
        <table>
          <tbody>
            <tr>
              <td>Ред</td>
            </tr>
          </tbody>
        </table>
      </div>,
    );
    const root = screen.getByTestId("invoice-issued");
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(screen.queryByRole("button", { name: /Запази|Издай|Добави ред/ })).toBeNull();
    expect(screen.getByText("0000000001")).toBeInTheDocument();
  });
});
