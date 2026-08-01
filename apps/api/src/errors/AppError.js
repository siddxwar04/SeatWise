/**
 * Application errors carry an HTTP status and a stable machine-readable code.
 * Anything thrown that is NOT an AppError is treated as unexpected by the
 * error handler and reported to the client as a generic 500 — the audit found
 * raw SQL strings and driver errors being echoed to the browser, which handed
 * attackers a free schema map.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    /** Expected errors are safe to show the user; unexpected ones are not. */
    this.isOperational = true;
    Error.captureStackTrace(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request', details) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

/**
 * 409. Used when a booking loses the race for the last table, and when an
 * email is already registered.
 */
export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with the current state', details) {
    super(409, 'CONFLICT', message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests — please slow down') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

/** A downstream dependency (ML service, LLM API) failed or timed out. */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}
