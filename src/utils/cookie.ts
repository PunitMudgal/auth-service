import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { Config } from "../config";
import { parseDurationToSeconds } from "./jwt";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getBaseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "Strict" as const,
    path: "/",
  };
}

export function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
) {
  const base = getBaseCookieOptions();

  setCookie(c, "access_token", accessToken, {
    ...base,
    maxAge: parseDurationToSeconds(Config.jwt.accessExpiresIn),
  });

  setCookie(c, "refresh_token", refreshToken, {
    ...base,
    maxAge: parseDurationToSeconds(Config.jwt.refreshExpiresIn),
    path: "/api/v1/auth",
  });
}

export function clearAuthCookies(c: Context) {
  const base = getBaseCookieOptions();

  setCookie(c, "access_token", "", { ...base, maxAge: 0 });
  setCookie(c, "refresh_token", "", {
    ...base,
    maxAge: 0,
    path: "/api/v1/auth",
  });
}

export function getDeviceInfo(c: Context) {
  return {
    ipAddress:
      c.req.header("x-real-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown",
    userAgent: c.req.header("user-agent") || undefined,
  };
}

export function getRefreshExpiry() {
  const seconds = parseDurationToSeconds(Config.jwt.refreshExpiresIn);
  const expiresAt = new Date(Date.now() + seconds * 1000);
  return { seconds, expiresAt };
}
