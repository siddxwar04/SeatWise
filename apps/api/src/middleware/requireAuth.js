import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import { verifyAccessToken } from '../lib/tokens.js';

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Rejects the request unless it carries a valid access token.
 *
 * Verification is signature-only — no database lookup. That is the whole point
 * of a stateless access token, and it is why the lifetime is 15 minutes: a
 * token stays valid until it expires even if the account is deleted, so the
 * window has to be short. Anything that must revoke immediately (logout,
 * password change) works through the refresh-token table instead.
 */
export function requireAuth(req, _res, next) {
  const token = readBearerToken(req);
  if (!token) {
    next(new UnauthorizedError('Please sign in to continue.'));
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    next(new UnauthorizedError('Your session has expired. Please sign in again.'));
    return;
  }

  req.user = { id: payload.sub, email: payload.email, role: payload.role };
  next();
}

/**
 * Attaches req.user when a valid token is present, but never rejects.
 * Used on endpoints that behave differently for signed-in users without
 * requiring an account — booking as a guest, for instance.
 */
export function optionalAuth(req, _res, next) {
  const token = readBearerToken(req);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    }
  }
  next();
}

/**
 * Role gate. Must be mounted after requireAuth.
 *
 *   router.get('/admin/reservations', requireAuth, requireRole('ADMIN'), handler)
 */
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Please sign in to continue.'));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('You do not have access to this area.'));
      return;
    }
    next();
  };
}
