import type { FastifyReply } from "fastify";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export const ACCESS_COOKIE_PATH = "/api";
export const REFRESH_COOKIE_PATH = "/api/auth";

export type CookieEnv = {
  isProduction: boolean;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
};

function baseOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isProduction,
    path: ACCESS_COOKIE_PATH,
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
  env: CookieEnv,
): void {
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(env.isProduction),
    path: ACCESS_COOKIE_PATH,
    maxAge: env.accessTokenTtlSeconds,
  });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(env.isProduction),
    path: REFRESH_COOKIE_PATH,
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60,
  });
}

export function clearAuthCookies(reply: FastifyReply, env: { isProduction: boolean }): void {
  reply.clearCookie(ACCESS_COOKIE, {
    ...baseOptions(env.isProduction),
    path: ACCESS_COOKIE_PATH,
  });
  reply.clearCookie(REFRESH_COOKIE, {
    ...baseOptions(env.isProduction),
    path: REFRESH_COOKIE_PATH,
  });
}
