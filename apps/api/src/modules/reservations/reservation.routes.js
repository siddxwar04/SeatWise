import { Router } from 'express';
import { z } from 'zod';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { optionalAuth, requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './reservation.controller.js';
import {
  availabilityQuerySchema,
  createReservationSchema,
  idParamSchema,
  listReservationsQuerySchema,
} from './reservation.schemas.js';

export const reservationRouter = Router();

// --- public -----------------------------------------------------------------

/** Slot grid for the booking form. Read-only and cacheable. */
reservationRouter.get(
  '/availability',
  validate({ query: availabilityQuerySchema }),
  controller.getAvailability,
);

/** Opening hours, slot length, party-size cap — so the form is driven by the
 *  server's rules rather than hard-coded HTML options that can drift. */
reservationRouter.get('/rules', controller.getRules);

/**
 * Booking is open to guests as well as account holders. optionalAuth attaches
 * the user when a token is present so the reservation gets linked, without
 * forcing a signup before someone can book a table.
 */
reservationRouter.post(
  '/',
  writeLimiter,
  optionalAuth,
  validate({ body: createReservationSchema }),
  controller.create,
);

/** Guest booking lookup: reference + the phone number on the booking. */
reservationRouter.post(
  '/lookup',
  writeLimiter,
  validate({
    body: z.object({
      reference: z.string().trim().min(3).max(12),
      phone: z.string().trim().min(10).max(15),
    }),
  }),
  controller.lookup,
);

// --- authenticated ----------------------------------------------------------

reservationRouter.get(
  '/mine',
  requireAuth,
  validate({ query: listReservationsQuerySchema }),
  controller.listMine,
);

reservationRouter.get(
  '/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  controller.getOne,
);

reservationRouter.post(
  '/:id/cancel',
  writeLimiter,
  requireAuth,
  validate({ params: idParamSchema }),
  controller.cancel,
);
