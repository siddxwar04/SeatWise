import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { optionalAuth, requireAuth, requireRestaurantAdmin } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { isRestaurantAdmin, resolveRestaurant } from '../restaurants/restaurant.service.js';
import * as menuService from './menu.service.js';
import {
  availabilityBodySchema,
  createMenuItemSchema,
  listMenuQuerySchema,
  menuIdParamSchema,
  safeMenuQuerySchema,
  slugParamSchema,
  updateMenuItemSchema,
} from './menu.schemas.js';

export const menuRouter = Router();

// --- public -----------------------------------------------------------------

menuRouter.get(
  '/',
  optionalAuth,
  validate({ query: listMenuQuerySchema }),
  asyncHandler(async (req, res) => {
    const venue = await resolveRestaurant({ restaurantSlug: req.query.restaurant });
    const wantsUnavailable = Boolean(req.query.includeUnavailable);
    // Global ADMIN or a RestaurantAdmin for this venue may see 86'd dishes.
    const canSeeUnavailable =
      Boolean(req.user) && (await isRestaurantAdmin(req.user.id, venue.id, req.user.role));
    const includeUnavailable = wantsUnavailable && canSeeUnavailable;

    res.json({
      items: await menuService.listMenu({
        restaurantId: venue.id,
        category: req.query.category,
        includeUnavailable,
      }),
    });
  }),
);

/**
 * Deterministic dietary filtering. Exposed as its own endpoint so the front
 * end can offer allergen filters directly, and so the Phase 8 assistant has a
 * single audited code path to call rather than composing its own query.
 */
menuRouter.get(
  '/safe',
  validate({ query: safeMenuQuerySchema }),
  asyncHandler(async (req, res) => {
    const venue = await resolveRestaurant({ restaurantSlug: req.query.restaurant });
    const items = await menuService.findSafeItems({
      restaurantId: venue.id,
      category: req.query.category,
      excludeAllergens: req.query.excludeAllergens,
      requireTags: req.query.requireTags,
    });
    res.json({
      items,
      filter: {
        excludedAllergens: req.query.excludeAllergens,
        requiredTags: req.query.requireTags,
      },
    });
  }),
);

menuRouter.get(
  '/:slug',
  validate({ params: slugParamSchema, query: listMenuQuerySchema.pick({ restaurant: true }) }),
  asyncHandler(async (req, res) => {
    const venue = await resolveRestaurant({ restaurantSlug: req.query.restaurant });
    res.json({ item: await menuService.getBySlug(venue.id, req.params.slug) });
  }),
);

// --- admin ------------------------------------------------------------------
// RestaurantAdmin (or global ADMIN) — never bare requireRole('ADMIN') alone,
// so a venue owner with role USER can manage their own menu.

menuRouter.post(
  '/',
  requireAuth,
  validate({ body: createMenuItemSchema }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    const { restaurantSlug: _slug, ...data } = req.body;
    res.status(201).json({
      item: await menuService.createMenuItem(req.restaurant.id, data),
    });
  }),
);

menuRouter.patch(
  '/:id',
  requireAuth,
  validate({ params: menuIdParamSchema, body: updateMenuItemSchema }),
  requireRestaurantAdmin({ resolveFromMenuItemId: true }),
  asyncHandler(async (req, res) => {
    res.json({ item: await menuService.updateMenuItem(req.params.id, req.body) });
  }),
);

menuRouter.patch(
  '/:id/availability',
  requireAuth,
  validate({ params: menuIdParamSchema, body: availabilityBodySchema }),
  requireRestaurantAdmin({ resolveFromMenuItemId: true }),
  asyncHandler(async (req, res) => {
    res.json({ item: await menuService.setAvailability(req.params.id, req.body.isAvailable) });
  }),
);

menuRouter.delete(
  '/:id',
  requireAuth,
  validate({ params: menuIdParamSchema }),
  requireRestaurantAdmin({ resolveFromMenuItemId: true }),
  asyncHandler(async (req, res) => {
    await menuService.deleteMenuItem(req.params.id);
    res.status(204).send();
  }),
);
