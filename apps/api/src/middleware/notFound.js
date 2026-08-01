import { NotFoundError } from '../errors/AppError.js';

/**
 * Terminates unmatched routes with a JSON 404. The legacy handlers returned a
 * blank white page for any direct GET, which is indistinguishable from a crash.
 */
export function notFound(req, _res, next) {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
}
