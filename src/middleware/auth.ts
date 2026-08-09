import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { JWTPayload } from "../types";
import { verifyAccessToken } from "../utils/jwt";
import { UnauthorizedError } from "../utils/errors";

declare module "hono" {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}

export const authenticate = createMiddleware(async (c, next) => {
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
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }

  await next();
});
