import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createRestaurantSchema } from './restaurant.schemas.js';
import * as restaurantService from './restaurant.service.js';

export const restaurantRouter = Router();

const slugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens'),
});

/** Public directory — the booking/menu UIs pick a venue from this list. */
restaurantRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ restaurants: await restaurantService.listActiveRestaurants() });
  }),
);

/**
 * Self-serve owner onboarding: any signed-in user may list a restaurant and
 * becomes its RestaurantAdmin immediately. There is no separate approval
 * step — the audit's successor product had no path to owner status at all
 * short of a platform admin hand-seeding a row.
 */
restaurantRouter.post(
  '/',
  requireAuth,
  writeLimiter,
  validate({ body: createRestaurantSchema }),
  asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.createRestaurant(req.body, req.user.id);
    res.status(201).json({ restaurant });
  }),
);

/**
 * Staff directory for the signed-in user. Mounted before /:slug so "mine"
 * is never parsed as a restaurant slug. Does not change the JWT — membership
 * is always read from RestaurantAdmin (or role ADMIN) at request time.
 */
restaurantRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      restaurants: await restaurantService.listManagedRestaurants(req.user.id, req.user.role),
    });
  }),
);

restaurantRouter.get(
  '/:slug',
  validate({ params: slugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ restaurant: await restaurantService.getRestaurantBySlug(req.params.slug) });
  }),
);
