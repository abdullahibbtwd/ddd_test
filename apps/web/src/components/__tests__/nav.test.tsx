import { Role } from "@ddcrm/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavList } from "@/components/nav-list";
import { NAV_ITEMS, navItemsForRole } from "@/config/nav";
import i18n from "@/i18n";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    Link: ({
      to,
      children,
      className,
      onClick,
      ...rest
    }: {
      to: string;
      children: React.ReactNode;
      className?: string;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <a href={to} className={className} onClick={onClick} {...rest}>
        {children}
      </a>
    ),
  };
});

describe("NavList role filtering", () => {
  it("renders only FIELD items for a FIELD user", () => {
    render(<NavList role={Role.FIELD} />);
    const nav = screen.getByRole("navigation", { name: "Основна навигация" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((l) => l.textContent)).toEqual([
      i18n.t("sites", { ns: "nav" }),
      i18n.t("month", { ns: "nav" }),
      i18n.t("invoices", { ns: "nav" }),
      i18n.t("payments", { ns: "nav" }),
    ]);
  });

  it("ADMIN sees every configured item", () => {
    render(<NavList role={Role.ADMIN} />);
    const nav = screen.getByRole("navigation", { name: "Основна навигация" });
    expect(within(nav).getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("navItemsForRole matches rendered count for OFFICE", () => {
    expect(navItemsForRole(Role.OFFICE)).toHaveLength(NAV_ITEMS.length - 1);
  });
});
