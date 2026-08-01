import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
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
    const wantsUnavailable = Boolean(req.query.includeUnavailable);
    const isAdmin = req.user?.role === 'ADMIN';
    res.json({
      items: await menuService.listMenu({
        category: req.query.category,
        includeUnavailable: wantsUnavailable && isAdmin,
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
    const items = await menuService.findSafeItems({
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
  validate({ params: slugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ item: await menuService.getBySlug(req.params.slug) });
  }),
);

// --- admin ------------------------------------------------------------------

const adminOnly = [requireAuth, requireRole('ADMIN')];

menuRouter.post(
  '/',
  ...adminOnly,
  validate({ body: createMenuItemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ item: await menuService.createMenuItem(req.body) });
  }),
);

menuRouter.patch(
  '/:id',
  ...adminOnly,
  validate({ params: menuIdParamSchema, body: updateMenuItemSchema }),
  asyncHandler(async (req, res) => {
    res.json({ item: await menuService.updateMenuItem(req.params.id, req.body) });
  }),
);

menuRouter.patch(
  '/:id/availability',
  ...adminOnly,
  validate({ params: menuIdParamSchema, body: availabilityBodySchema }),
  asyncHandler(async (req, res) => {
    res.json({ item: await menuService.setAvailability(req.params.id, req.body.isAvailable) });
  }),
);

menuRouter.delete(
  '/:id',
  ...adminOnly,
  validate({ params: menuIdParamSchema }),
  asyncHandler(async (req, res) => {
    await menuService.deleteMenuItem(req.params.id);
    res.status(204).send();
  }),
);
