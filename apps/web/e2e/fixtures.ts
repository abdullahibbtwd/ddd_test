import { expect, test as base, type Page, type Route } from "@playwright/test";

export type { Page, Route };

export type ApiFailureAllow = {
  status: number;
  /** Match against the response URL. If omitted, any URL with that status is allowed. */
  url?: RegExp | string;
};

export type ConsoleGuardOptions = {
  /** Console error / pageerror text that is expected for this test. */
  allowConsole?: Array<string | RegExp>;
  /** Same-origin `/api` responses that the test expects to fail on purpose. */
  allowApiFailures?: ApiFailureAllow[];
};

type Fixtures = {
  consoleGuard: ConsoleGuardOptions;
};

/** Always-allowed: SPA session probe before login (and after logout). */
const DEFAULT_API_ALLOWS: ApiFailureAllow[] = [
  { status: 401, url: /\/api\/auth\/me(?:\?|$)/ },
  // The bell's in-flight list can finish after logout clears the cookie.
  { status: 401, url: /\/api\/notifications\/me(?:\?|$)/ },
];

function matchesAllow(text: string, allow: Array<string | RegExp>): boolean {
  return allow.some((a) => (typeof a === "string" ? text.includes(a) : a.test(text)));
}

function matchesApiAllow(url: string, status: number, allow: ApiFailureAllow[]): boolean {
  return allow.some((entry) => {
    if (entry.status !== status) return false;
    if (!entry.url) return true;
    if (typeof entry.url === "string") return url.includes(entry.url);
    return entry.url.test(url);
  });
}

function isSameOriginApi(page: Page, responseUrl: string): boolean {
  let pathname: string;
  let origin: string;
  try {
    const u = new URL(responseUrl);
    pathname = u.pathname;
    origin = u.origin;
  } catch {
    return false;
  }
  if (!pathname.startsWith("/api")) return false;

  const pageUrl = page.url();
  if (!pageUrl || pageUrl === "about:blank") {
    return origin.includes("localhost") || origin.includes("127.0.0.1");
  }
  try {
    return origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Shared Playwright test that fails on unexpected console errors, uncaught page
 * errors, or failed same-origin `/api` responses (4xx/5xx). Opt in expected
 * failures via `test.use({ consoleGuard: { allowApiFailures, allowConsole } })`.
 *
 * `/api/auth/me` → 401 is always allowed (unauthenticated session probe).
 */
export const test = base.extend<Fixtures>({
  consoleGuard: [{}, { option: true }],

  page: async ({ page, consoleGuard }, use) => {
    const failures: string[] = [];
    const allowConsole = consoleGuard.allowConsole ?? [];
    const allowApi = [...DEFAULT_API_ALLOWS, ...(consoleGuard.allowApiFailures ?? [])];

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (matchesAllow(text, allowConsole)) return;
      // Browser "Failed to load resource" for /api is covered by the response listener.
      if (/Failed to load resource/i.test(text)) return;
      failures.push(`[console.error] ${text}`);
    });

    page.on("pageerror", (error) => {
      const text = error.message;
      if (matchesAllow(text, allowConsole)) return;
      failures.push(`[pageerror] ${text}`);
    });

    page.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const url = response.url();
      if (!isSameOriginApi(page, url)) return;
      if (matchesApiAllow(url, status, allowApi)) return;
      failures.push(`[api ${status}] ${url}`);
    });

    await use(page);

    expect(failures, failures.join("\n")).toEqual([]);
  },
});

export { expect };
