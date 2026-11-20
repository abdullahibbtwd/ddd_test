import { Role } from "@ddcrm/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AbilityProvider, Can } from "@/auth/ability";

describe("<Can>", () => {
  it("shows content for ADMIN on AuditLog and hides for FIELD", () => {
    const { rerender } = render(
      <AbilityProvider user={{ id: "1", role: Role.ADMIN, areas: [] }}>
        <Can I="read" a="AuditLog">
          visible-admin
        </Can>
      </AbilityProvider>,
    );
    expect(screen.getByText("visible-admin")).toBeInTheDocument();

    rerender(
      <AbilityProvider user={{ id: "2", role: Role.FIELD, areas: [] }}>
        <Can I="read" a="AuditLog">
          visible-field
        </Can>
      </AbilityProvider>,
    );
    expect(screen.queryByText("visible-field")).not.toBeInTheDocument();
  });
});
