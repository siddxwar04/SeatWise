import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth, requireRestaurantAdmin } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import * as waitlistService from '../waitlist/waitlist.service.js';

/**
 * Owner dashboard waitlist surface.
 * Spec path: GET /api/dashboard/waitlist
 */
export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const restaurantQuery = z.object({
  restaurant: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(['WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED']).optional(),
});

dashboardRouter.get(
  '/waitlist',
  validate({ query: restaurantQuery }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json(
      await waitlistService.listWaitlist(req.restaurant.id, { status: req.query.status }),
    );
  }),
);
