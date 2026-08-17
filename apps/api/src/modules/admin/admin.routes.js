import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth, requireRestaurantAdmin } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import * as analyticsService from '../analytics/analytics.service.js';
import * as overbookingService from '../overbooking/overbooking.service.js';
import { idParamSchema, updateStatusSchema } from '../reservations/reservation.schemas.js';
import { todayLocal } from '../../lib/slots.js';
import { toPublicReservation } from '../reservations/reservation.service.js';
import * as adminService from './admin.service.js';

export const adminRouter = Router();

// Authenticated first; each route then applies requireRestaurantAdmin so a
// venue owner (USER + RestaurantAdmin) can manage only their restaurant, while
// global ADMIN still passes the join-table bypass.
adminRouter.use(requireAuth);

const restaurantSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const listQuerySchema = z.object({
  restaurant: restaurantSlug,
  status: z
    .enum(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().trim().max(80).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const restaurantQuerySchema = z.object({
  restaurant: restaurantSlug,
});

adminRouter.get(
  '/reservations',
  validate({ query: listQuerySchema }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json(
      await adminService.listReservations({
        ...req.query,
        restaurantId: req.restaurant.id,
      }),
    );
  }),
);

adminRouter.patch(
  '/reservations/:id/status',
  validate({
    params: idParamSchema,
    body: updateStatusSchema,
    query: restaurantQuerySchema,
  }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    const updated = await adminService.updateStatus(
      req.params.id,
      req.body.status,
      req.body.version,
      req.user.id,
      req.restaurant.id,
    );
    res.json({ reservation: toPublicReservation(updated) });
  }),
);

/** Front-of-house screen: everyone expected today, in time order. */
adminRouter.get(
  '/service/today',
  validate({ query: restaurantQuerySchema }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json(await adminService.getTodayService(req.restaurant.id));
  }),
);

adminRouter.get(
  '/stats',
  validate({
    query: restaurantQuerySchema.extend({
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
  }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json(await adminService.getDashboardStats(req.restaurant.id, req.query.days));
  }),
);

adminRouter.get(
  '/tables',
  validate({ query: restaurantQuerySchema }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json({ tables: await adminService.listTables(req.restaurant.id) });
  }),
);

adminRouter.post(
  '/reservations/:id/reminder',
  validate({
    params: idParamSchema,
    query: restaurantQuerySchema,
  }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json(await adminService.sendReminder(req.params.id, req.restaurant.id));
  }),
);

adminRouter.get(
  '/overbooking',
  validate({
    query: restaurantQuerySchema.extend({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    const date = req.query.date ?? todayLocal();
    const slots = await overbookingService.getDayOverbooking(req.restaurant.id, date);
    res.json({
      restaurantId: req.restaurant.id,
      date,
      slots,
      highlights: slots.filter((s) => s.recommendedExtraBookings > 0),
    });
  }),
);

adminRouter.get(
  '/analytics',
  validate({
    query: restaurantQuerySchema.extend({
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
  }),
  requireRestaurantAdmin(),
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.getAnalytics(req.restaurant.id, req.query.days));
  }),
);
