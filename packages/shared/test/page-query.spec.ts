import { describe, expect, it } from "vitest";
import { PageQuerySchema } from "../src/page-query";

describe("PageQuerySchema", () => {
  it("applies defaults", () => {
    const parsed = PageQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20 });
  });

  it("accepts search and sort", () => {
    const parsed = PageQuerySchema.parse({
      page: "2",
      pageSize: "50",
      search: "ресторант",
      sort: "name:asc",
    });
    expect(parsed).toEqual({
      page: 2,
      pageSize: 50,
      search: "ресторант",
      sort: "name:asc",
    });
  });

  it("rejects pageSize above 100", () => {
    const result = PageQuerySchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects page below 1", () => {
    const result = PageQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });
});
