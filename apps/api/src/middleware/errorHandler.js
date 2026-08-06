import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../lib/logger.js';

/**
 * The single exit point for every failure in the API.
 *
 * Rule: the client is told what it needs to correct its request and nothing
 * more. Stack traces, SQL, and driver messages go to the log, never the wire.
 *
 * Express identifies error handlers by their four-argument signature, so
 * `next` must stay in the parameter list even though it is unused.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our end. Please try again.';
  let details;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Map the handful of Prisma codes that correspond to real user mistakes.
    // Everything else stays a generic 500 — a constraint name is schema
    // information and does not belong in a response body.
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'CONFLICT';
      message = 'That value is already taken.';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'The requested record does not exist.';
    } else if (err.code === 'P2003') {
      statusCode = 400;
      code = 'BAD_REQUEST';
      message = 'Referenced record does not exist.';
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    // Bad client query shape — never leak the Prisma message to the wire.
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'Invalid request data.';
  }

  const isServerError = statusCode >= 500;
  const logPayload = {
    err,
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
  };

  if (isServerError) {
    logger.error(logPayload, 'unhandled request error');
  } else {
    logger.warn(logPayload, 'request rejected');
  }

  const body = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  if (req.id) body.error.requestId = String(req.id);
  if (!isProduction && isServerError && err instanceof Error) body.error.stack = err.stack;

  res.status(statusCode).json(body);
}
