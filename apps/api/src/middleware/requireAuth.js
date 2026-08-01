import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../lib/prisma.js';
import { resolveRestaurant } from '../modules/restaurants/restaurant.service.js';

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

/**
 * Pulls restaurant identity from the usual request surfaces. Callers pass
 * either a public slug or a UUID; we never invent a default here — silent
 * cross-restaurant behaviour is exactly what multi-tenant scoping forbids.
 */
function readRestaurantRef(req) {
  return {
    restaurantId:
      req.params?.restaurantId ??
      req.query?.restaurantId ??
      req.body?.restaurantId ??
      req.restaurantId ??
      null,
    restaurantSlug:
      req.params?.restaurantSlug ??
      req.params?.slug ??
      req.query?.restaurant ??
      req.query?.restaurantSlug ??
      req.body?.restaurantSlug ??
      req.body?.restaurant ??
      null,
  };
}

/**
 * Venue-scoped admin gate. Must be mounted after requireAuth.
 *
 * Looks up RestaurantAdmin by (userId, restaurantId) on every request rather
 * than reading memberships from the JWT. That keeps token payloads stable and
 * means granting/revoking a venue takes effect immediately — embedding
 * restaurantIds in the access token would leave stale grants valid until the
 * 15-minute TTL expired.
 *
 * Global Role.ADMIN bypasses the join table on purpose: platform operators
 * need to inspect any venue without a seed row per restaurant. Venue owners
 * (role USER + RestaurantAdmin) are strictly scoped to their memberships.
 *
 * On success sets `req.restaurant` so handlers do not re-resolve the slug.
 */
export function requireRestaurantAdmin(options = {}) {
  const { resolveFromMenuItemId = false } = options;

  return async (req, _res, next) => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Please sign in to continue.'));
        return;
      }

      let ref = readRestaurantRef(req);

      // PATCH/DELETE /menu/:id — the item itself carries restaurantId, so the
      // client does not have to re-send the venue on every edit.
      if (!ref.restaurantId && !ref.restaurantSlug && resolveFromMenuItemId && req.params?.id) {
        const item = await prisma.menuItem.findUnique({
          where: { id: req.params.id },
          select: { restaurantId: true },
        });
        if (!item) {
          next(new ForbiddenError('You do not have access to this area.'));
          return;
        }
        ref = { restaurantId: item.restaurantId, restaurantSlug: null };
      }

      const restaurant = await resolveRestaurant(ref);
      req.restaurant = restaurant;

      if (req.user.role === 'ADMIN') {
        next();
        return;
      }

      const membership = await prisma.restaurantAdmin.findUnique({
        where: {
          userId_restaurantId: { userId: req.user.id, restaurantId: restaurant.id },
        },
        select: { id: true },
      });

      if (!membership) {
        next(new ForbiddenError('You do not have access to this restaurant.'));
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
