import { ErrorCode } from "@ddcrm/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiFetch, mapErrorResponse } from "@/api/mutator";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapErrorResponse", () => {
  it("passes through the shared ApiError contract", () => {
    const error = mapErrorResponse(409, {
      code: "CONFLICT",
      message: "Duplicate EIK",
      details: { field: "eik" },
    });
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      code: ErrorCode.CONFLICT,
      message: "Duplicate EIK",
      details: { field: "eik" },
      status: 409,
    });
  });

  it.each([
    [400, ErrorCode.VALIDATION_FAILED],
    [401, ErrorCode.UNAUTHENTICATED],
    [403, ErrorCode.FORBIDDEN],
    [404, ErrorCode.NOT_FOUND],
    [409, ErrorCode.CONFLICT],
    [422, ErrorCode.VALIDATION_FAILED],
    [429, ErrorCode.TOO_MANY_REQUESTS],
    [500, ErrorCode.INTERNAL],
    [503, ErrorCode.INTERNAL],
  ])("maps framework error with HTTP %i to %s", (status, code) => {
    const error = mapErrorResponse(status, { statusCode: status, message: "boom" });
    expect(error.code).toBe(code);
    expect(error.message).toBe("boom");
  });

  it("joins validation message arrays and keeps them as details", () => {
    const error = mapErrorResponse(400, { message: ["a is required", "b must be a uuid"] });
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.message).toBe("a is required; b must be a uuid");
    expect(error.details).toEqual(["a is required", "b must be a uuid"]);
  });

  it("falls back to a generic message for non-JSON bodies", () => {
    const error = mapErrorResponse(502, "<html>Bad gateway</html>");
    expect(error).toMatchObject({ code: ErrorCode.INTERNAL, message: "HTTP 502", status: 502 });
  });
});

describe("apiFetch", () => {
  it("sends credentials: include and returns { data, status, headers }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ data: unknown; status: number; headers: Headers }>(
      "/api/health",
      { method: "GET" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/api/health")).toBe(true);
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("GET");
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ status: "ok" });
  });

  it("throws a typed ApiRequestError on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { code: "FORBIDDEN", message: "Нямате достъп" })),
    );

    const error = await apiFetch("/api/clients", { method: "GET" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: ErrorCode.FORBIDDEN, message: "Нямате достъп", status: 403 });
  });

  it("maps network failures to INTERNAL with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await apiFetch("/api/health", { method: "GET" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: ErrorCode.INTERNAL, status: 0 });
  });
});
