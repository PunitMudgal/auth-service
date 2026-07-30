import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { JWTPayload } from "../types";
import { verifyAccessToken } from "../utils/jwt";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

/**
 * Augment Hono's ContextVariableMap so `c.get("user")` is typed
 */
declare module "hono" {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}

/**
 * Middleware that requires a valid access token.
 * Resolves the token from (in priority order):
 *   1. `Authorization: Bearer <token>` header
 *   2. `access_token` cookie
 * Verifies it and sets `c.var.user` with the decoded payload.
 */
export const authenticate = createMiddleware(async (c, next) => {
  // Try Authorization header first, then fall back to cookie
  const authHeader = c.req.header("Authorization");
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = getCookie(c, "access_token");
  }

  if (!token) {
    throw new UnauthorizedError(
      "Authentication required. Provide a valid access token.",
    );
  }

  try {
    const payload = await verifyAccessToken(token);
    c.set("user", payload);
    await next();
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
});

/**
 * @example
 * app.get("/admin", authenticate, requireRole("admin"), handler)
 */
export const requireRole = (...roles: JWTPayload["role"][]) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenError(
        `Access denied. Required role: ${roles.join(" or ")}`,
      );
    }
    await next();
  });
