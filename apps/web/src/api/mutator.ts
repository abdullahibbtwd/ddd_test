import { ApiErrorSchema, ErrorCode, type ApiError } from "@ddcrm/shared";
import { queryClient } from "@/lib/query-client";

/**
 * Custom Orval mutator. Every generated hook goes through `apiFetch`.
 * - credentials: include (httpOnly cookies)
 * - same-origin `/api/...` (Vite proxy in dev, Caddy in prod)
 * - single-flight refresh on 401 (except `/auth/*`)
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

/** Throwable that carries the shared `ApiError` shape + HTTP status (0 = network failure). */
export class ApiRequestError extends Error implements ApiError {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

export function isApiRequestError(value: unknown): value is ApiRequestError {
  return value instanceof ApiRequestError;
}

function codeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 422:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.TOO_MANY_REQUESTS;
    default:
      return ErrorCode.INTERNAL;
  }
}

/** Maps a non-2xx response (parsed body may be anything) to an `ApiRequestError`. */
export function mapErrorResponse(status: number, body: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiRequestError(status, parsed.data);
  }

  let message = `HTTP ${status}`;
  let details: unknown = undefined;
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") {
      message = record.message;
    } else if (Array.isArray(record.message)) {
      message = record.message.join("; ");
      details = record.message;
    }
  }

  return new ApiRequestError(status, { code: codeFromStatus(status), message, details });
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isAuthPath(url: string): boolean {
  return /\/api\/auth(\/|$)/.test(url) || /(?:^|\/)auth(\/|$)/.test(url);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exported for tests — reset single-flight state between cases. */
export function resetRefreshState(): void {
  refreshInFlight = null;
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function redirectToLogin(): void {
  queryClient.clear();
  const path = `${window.location.pathname}${window.location.search}`;
  const redirect = encodeURIComponent(path || "/");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign(`/login?redirect=${redirect}`);
  }
}

/**
 * Orval (fetch client) calls `apiFetch(url, { method, body, signal, headers })` and expects
 * `{ data, status, headers }` back.
 */
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  return apiFetchInternal(url, options, true);
}

async function apiFetchInternal<T>(
  url: string,
  options: RequestInit,
  allowRefresh: boolean,
): Promise<T> {
  const body = options.body;
  const hasJsonBody = typeof body === "string";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiRequestError(0, {
      code: ErrorCode.INTERNAL,
      message: cause instanceof Error ? cause.message : "Network error",
    });
  }

  if (response.status === 401 && allowRefresh && !isAuthPath(url)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetchInternal(url, options, false);
    }
    redirectToLogin();
    throw mapErrorResponse(401, { code: ErrorCode.UNAUTHENTICATED, message: "Session expired" });
  }

  const data = await readBody(response);

  if (!response.ok) {
    throw mapErrorResponse(response.status, data);
  }

  return { data, status: response.status, headers: response.headers } as T;
}

export default apiFetch;

export type ErrorType<_Error> = ApiRequestError;
export type BodyType<BodyData> = BodyData;
