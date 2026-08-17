import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth, requireRestaurantAdmin } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { assignWaitlistSchema } from '../waitlist/waitlist.schemas.js';
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

dashboardRouter.post(
  '/waitlist/assign',
  validate({
    query: restaurantQuery.omit({ status: true }),
    body: assignWaitlistSchema,
  }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    const options = { date: req.body.date, time: req.body.time };
    if (req.body.apply) {
      res.json(await waitlistService.applyWaitlistAssignments(req.restaurant.id, options));
      return;
    }
    res.json(await waitlistService.planWaitlistAssignments(req.restaurant.id, options));
  }),
);
