import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema, updateStatusSchema } from '../reservations/reservation.schemas.js';
import { toPublicReservation } from '../reservations/reservation.service.js';
import * as adminService from './admin.service.js';

export const adminRouter = Router();

// Every route below this line requires an authenticated ADMIN. Mounting the
// guard once on the router is safer than remembering it per route — a new
// endpoint added later is protected by default rather than by discipline.
adminRouter.use(requireAuth, requireRole('ADMIN'));

const listQuerySchema = z.object({
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

adminRouter.get(
  '/reservations',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await adminService.listReservations(req.query));
  }),
);

adminRouter.patch(
  '/reservations/:id/status',
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(async (req, res) => {
    const updated = await adminService.updateStatus(
      req.params.id,
      req.body.status,
      req.body.version,
      req.user.id,
    );
    res.json({ reservation: toPublicReservation(updated) });
  }),
);

/** Front-of-house screen: everyone expected today, in time order. */
adminRouter.get(
  '/service/today',
  asyncHandler(async (_req, res) => {
    res.json(await adminService.getTodayService());
  }),
);

adminRouter.get(
  '/stats',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }),
  asyncHandler(async (req, res) => {
    res.json(await adminService.getDashboardStats(req.query.days));
  }),
);

adminRouter.get(
  '/tables',
  asyncHandler(async (_req, res) => {
    res.json({ tables: await adminService.listTables() });
  }),
);
