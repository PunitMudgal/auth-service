import { validator } from "hono/validator";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../utils/errors";

export const validateBody = <T extends ZodTypeAny>(schema: T) =>
  validator("json", (value) => {
    const parsedBody = schema.safeParse(value);

    if (!parsedBody.success) {
      throw new ValidationError(
        parsedBody.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    return parsedBody.data;
  });