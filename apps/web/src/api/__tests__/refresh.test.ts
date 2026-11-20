import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, resetRefreshState } from "@/api/mutator";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetRefreshState();
});

describe("apiFetch single-flight refresh", () => {
  it("issues ONE refresh for three simultaneous 401s, then retries", async () => {
    let refreshCalls = 0;
    let healthCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/api/auth/refresh")) {
          refreshCalls += 1;
          await new Promise((r) => setTimeout(r, 30));
          return jsonResponse(200, { ok: true });
        }
        if (path.includes("/api/health")) {
          healthCalls += 1;
          if (healthCalls <= 3) {
            return jsonResponse(401, { code: "UNAUTHENTICATED", message: "expired" });
          }
          return jsonResponse(200, { status: "ok" });
        }
        return jsonResponse(404, { code: "NOT_FOUND", message: "missing" });
      }),
    );

    const results = await Promise.all([
      apiFetch("/api/health"),
      apiFetch("/api/health"),
      apiFetch("/api/health"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect((result as { status: number }).status).toBe(200);
    }
  });

  it("redirects to /login when refresh fails", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/clients",
        search: "",
        assign,
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/auth/refresh")) {
          return jsonResponse(401, { code: "UNAUTHENTICATED", message: "nope" });
        }
        return jsonResponse(401, { code: "UNAUTHENTICATED", message: "expired" });
      }),
    );

    await expect(apiFetch("/api/health")).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith("/login?redirect=%2Fclients");
  });
});
