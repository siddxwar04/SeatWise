import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
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
