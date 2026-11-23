import { describe, expect, it } from "vitest";
import { buildNavigationUrl } from "./navigation-url";

describe("buildNavigationUrl", () => {
  it("uses lat,lng when both coordinates are set", () => {
    expect(buildNavigationUrl({ lat: 42.6977, lng: 23.3219, address: "ignored" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=42.6977,23.3219",
    );
  });

  it("falls back to url-encoded address without coordinates", () => {
    expect(buildNavigationUrl({ address: "ул. Витоша 1, София" })).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("ул. Витоша 1, София")}`,
    );
  });

  it("encodes Cyrillic addresses", () => {
    const address = "бул. България 100, Пловдив";
    const url = buildNavigationUrl({ address });
    expect(url).toContain(encodeURIComponent(address));
    expect(url).not.toContain("бул.");
  });

  it("treats null/undefined coords as missing", () => {
    expect(buildNavigationUrl({ lat: null, lng: null, address: "Адрес" })).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Адрес")}`,
    );
  });
});
