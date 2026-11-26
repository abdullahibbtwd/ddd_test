import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTHENTICATED_ONLY_KEY } from "../src/auth/decorators/authenticated-only.decorator";
import { CHECK_ABILITY_KEY } from "../src/auth/decorators/can.decorator";
import { IS_PUBLIC_KEY } from "../src/auth/decorators/public.decorator";
import {
  startAuthTestApp,
  stopAuthTestApp,
  type AuthTestContext,
} from "./helpers/auth-app";

/** Routes that may be called without cookies. Everything else must 401. */
const PUBLIC_ALLOWLIST = new Set([
  "GET /api/health",
  "GET /api/health/ready",
  "POST /api/auth/login",
  "POST /api/auth/refresh",
]);

type RouteEntry = {
  method: string;
  path: string;
  policy: "public" | "authenticated" | "can";
};

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.ALL]: "ALL",
  [RequestMethod.OPTIONS]: "OPTIONS",
  [RequestMethod.HEAD]: "HEAD",
};

function joinPath(...parts: Array<string | string[] | undefined>): string {
  const flat = parts
    .flat()
    .filter((p): p is string => p !== undefined && p !== null && String(p).length > 0)
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0 && p !== "/");
  return `/${["api", ...flat].join("/")}`;
}

type NestModulesMap = Map<
  unknown,
  {
    controllers: Map<unknown, { metatype: object }>;
  }
>;

function collectNestRoutes(app: AuthTestContext["app"]): RouteEntry[] {
  const modules = (
    app as unknown as { container: { getModules: () => NestModulesMap } }
  ).container.getModules();

  const seen = new Set<string>();
  const routes: RouteEntry[] = [];

  for (const mod of modules.values()) {
    for (const controller of mod.controllers.values()) {
      const metatype = controller.metatype;
      if (!metatype) continue;
      const controllerPath = (Reflect.getMetadata(PATH_METADATA, metatype) as string) ?? "";
      const proto = (metatype as { prototype: object }).prototype;

      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === "constructor") continue;
        const handler = (proto as Record<string, unknown>)[key];
        if (typeof handler !== "function") continue;

        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
          | number
          | undefined;
        if (requestMethod === undefined) continue;
        const method = METHOD_NAMES[requestMethod] ?? "GET";
        if (method === "HEAD" || method === "OPTIONS" || method === "ALL") continue;

        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as
          | string
          | string[]
          | undefined;
        const path = joinPath(controllerPath, methodPath);
        const id = `${method} ${path}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const isPublic =
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true;
        const authenticatedOnly =
          Reflect.getMetadata(AUTHENTICATED_ONLY_KEY, handler) === true ||
          Reflect.getMetadata(AUTHENTICATED_ONLY_KEY, metatype) === true;
        const can =
          Reflect.getMetadata(CHECK_ABILITY_KEY, handler) !== undefined ||
          Reflect.getMetadata(CHECK_ABILITY_KEY, metatype) !== undefined;

        const flags = [isPublic, authenticatedOnly, can].filter(Boolean).length;
        expect(
          flags,
          `${id} must have exactly one of @Public, @AuthenticatedOnly, @Can`,
        ).toBe(1);

        routes.push({
          method,
          path,
          policy: isPublic ? "public" : authenticatedOnly ? "authenticated" : "can",
        });
      }
    }
  }

  return routes.sort((a, b) =>
    `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
  );
}

describe("default-deny (every route requires auth unless allowlisted)", () => {
  let ctx: AuthTestContext;
  let routes: RouteEntry[] = [];

  beforeAll(async () => {
    ctx = await startAuthTestApp();
    routes = collectNestRoutes(ctx.app);
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopAuthTestApp(ctx);
  });

  it("enumerates routes and asserts 401 except the public allowlist", async () => {
    expect(routes.length).toBeGreaterThan(0);

    const checked: string[] = [];
    for (const route of routes) {
      const id = `${route.method} ${route.path}`;
      checked.push(`${id} [${route.policy}]`);

      const res = await ctx.inject({
        method: route.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        url: route.path,
        payload: route.method === "GET" || route.method === "DELETE" ? undefined : {},
        headers:
          route.method === "GET" || route.method === "DELETE"
            ? undefined
            : { origin: "http://localhost:5173" },
      });

      if (PUBLIC_ALLOWLIST.has(id)) {
        expect(route.policy).toBe("public");
        if (res.statusCode === 401) {
          expect(res.json().message, id).not.toBe("Authentication required");
        }
      } else {
        expect(res.statusCode, `${id} must be protected`).toBe(401);
        expect(res.json().code).toBe("UNAUTHENTICATED");
      }
    }

    for (const allowed of PUBLIC_ALLOWLIST) {
      expect(
        checked.some((line) => line.startsWith(allowed)),
        `allowlist route missing: ${allowed}`,
      ).toBe(true);
    }

    const { writeFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const out = resolve(__dirname, "default-deny-routes.txt");
    writeFileSync(out, checked.join("\n") + "\n", "utf8");
    expect(checked.some((l) => l.startsWith("GET /api/health"))).toBe(true);
    expect(checked.some((l) => l.includes("GET /api/audit-log"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/users"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/notifications/me"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/notifications/summary"))).toBe(true);
    expect(checked.some((l) => l.startsWith("POST /api/notifications/read-all"))).toBe(true);
    expect(checked.some((l) => l.startsWith("POST /api/notifications/:id/read"))).toBe(true);
    expect(checked.some((l) => l.startsWith("POST /api/notifications/:id/dismiss"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/areas"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/sites"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/sites/map"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/site-types"))).toBe(true);
    expect(checked.some((l) => l.startsWith("GET /api/scheduling/month"))).toBe(
      true,
    );
    expect(
      checked.some((l) => l.startsWith("GET /api/scheduling/month/days")),
    ).toBe(true);
    // Full route inventory is written to apps/api/test/default-deny-routes.txt
    // and printed below for the Task 14 evidence report.
    console.log("\n--- default-deny route list ---\n" + checked.join("\n") + "\n");
  });

  it("Bull Board hook: GET /api/admin/queues without cookie → 401", async () => {
    let boardCtx: AuthTestContext | undefined;
    try {
      boardCtx = await startAuthTestApp({ enableBullBoard: true });
      const res = await boardCtx.inject({
        method: "GET",
        url: "/api/admin/queues",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    } finally {
      if (boardCtx) await stopAuthTestApp(boardCtx);
    }
  }, 180_000);
});
