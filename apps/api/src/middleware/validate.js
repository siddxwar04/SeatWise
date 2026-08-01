import { ZodError } from 'zod';
import { ValidationError } from '../errors/AppError.js';

/** Flattens Zod issues into `{ "field.path": "message" }` for the client. */
function formatIssues(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (out[key] === undefined) out[key] = issue.message;
  }
  return out;
}

/**
 * Validates and *replaces* the request parts with the parsed output, so
 * handlers downstream receive coerced, stripped data rather than raw input
 * straight off the wire.
 *
 * The audit's finding #9 was that every $_POST value was trusted and the only
 * checks were HTML `required` attributes — removable with a two-second DevTools
 * edit. Nothing reaches a service here without passing a schema first.
 *
 * Usage:
 *   router.post('/', validate({ body: registerSchema }), handler)
 */
export function validate(targets) {
  return (req, _res, next) => {
    try {
      if (targets.params) req.params = targets.params.parse(req.params);
      if (targets.query) {
        // req.query is getter-only on newer Express; redefining the property
        // keeps this working across versions.
        const parsed = targets.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (targets.body) req.body = targets.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Please check the highlighted fields', formatIssues(err)));
        return;
      }
      next(err);
    }
  };
}
