import { validator } from "hono/validator";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../utils/errors";

export const validateQuery = <T extends ZodTypeAny>(schema: T) =>
  validator("query", (value) => {
    const parsedQuery = schema.safeParse(value);

    if (!parsedQuery.success) {
      throw new ValidationError(
        parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
      );
    }

    return parsedQuery.data;
  });
