import { createMiddleware } from "hono/factory";
import type { JWTPayload } from "../types";
import { ForbiddenError } from "../utils/errors";

type CanAccessOptions = {
  allowSelf?: boolean;
};

export const canAccess = (
  ...args: Array<JWTPayload["role"] | CanAccessOptions>
) => {
  const roles = args.filter(
    (arg): arg is JWTPayload["role"] => typeof arg === "string",
  );
  const options = args.find(
    (arg): arg is CanAccessOptions => typeof arg === "object",
  );

  return createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw new ForbiddenError("Access denied");
    }

    const isAllowedRole = roles.includes(user.role);
    const isSelf =
      options?.allowSelf === true && c.req.param("id") === user.sub;

    if (!isAllowedRole && !isSelf) {
      throw new ForbiddenError(
        `Access denied. Required role: ${roles.join(" or ")}`,
      );
    }

    await next();
  });
};
