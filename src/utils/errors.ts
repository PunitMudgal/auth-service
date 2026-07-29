import { HTTPException } from "hono/http-exception";

type AppErrorStatus = NonNullable<
  ConstructorParameters<typeof HTTPException>[0]
>;

/**
 * Base class for application-specific errors
 * Extends HTTPException so the global error handler can properly handle them
 */
export class AppError extends HTTPException {
  constructor(status: AppErrorStatus, message: string) {
    super(status, { message });
    this.name = "AppError";
  }
}

/**
 * 400 Bad Request - Validation errors, missing fields, invalid input
 */
export class ValidationError extends AppError {
  constructor(message: string = "Validation failed") {
    super(400, message);
    this.name = "ValidationError";
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden - Authenticated but not allowed
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

/**
 * 409 Conflict - Resource already exists (duplicates)
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(409, message);
    this.name = "ConflictError";
  }
}

/**
 * 422 Unprocessable Entity - Valid syntax but semantic errors
 */
export class UnprocessableEntityError extends AppError {
  constructor(message: string = "Unprocessable entity") {
    super(422, message);
    this.name = "UnprocessableEntityError";
  }
}
