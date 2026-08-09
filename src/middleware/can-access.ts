import { createMiddleware } from "hono/factory";
import type { JWTPayload } from "../types";
import { ForbiddenError } from "../utils/errors";

export const canAccess = (...roles: JWTPayload["role"][]) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenError(
        `Access denied. Required role: ${roles.join(" or ")}`,
      );
    }
    await next();
  });
