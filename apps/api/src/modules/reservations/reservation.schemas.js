import { z } from 'zod';
import { env } from '../../config/env.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That date does not exist');

const slotTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time from the list');

const guestName = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be 80 characters or fewer')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u, 'Name contains invalid characters');

const guestPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?91[- ]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
  .transform((v) => v.replace(/\D/g, '').slice(-10));

/**
 * An integer, with a floor of 1 and a ceiling from config.
 *
 * The legacy form posted "2 People" and "5+ People" as display strings. The
 * audit called this out specifically: "5+ People" destroys capacity
 * arithmetic permanently, because there is no number to add up.
 */
const partySize = z.coerce
  .number()
  .int('Party size must be a whole number')
  .min(1, 'A booking needs at least one guest')
  .max(env.MAX_PARTY_SIZE, `For parties over ${env.MAX_PARTY_SIZE}, please call us directly`);

/** Public venue key — preferred over UUID on guest-facing forms. */
export const restaurantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Restaurant slug must be lowercase hyphenated words');

export const createReservationSchema = z.object({
  restaurantSlug: restaurantSlugSchema,
  guestName,
  guestPhone,
  guestEmail: z.string().trim().toLowerCase().email('Enter a valid email').max(254).optional(),
  partySize,
  date: isoDate,
  time: slotTime,
  specialRequests: z
    .string()
    .trim()
    .max(500, 'Please keep requests under 500 characters')
    .optional(),
});

export const availabilityQuerySchema = z.object({
  restaurant: restaurantSlugSchema,
  date: isoDate,
  partySize: partySize.optional().default(2),
});

export const referenceParamSchema = z.object({
  reference: z.string().trim().min(3).max(12),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Not a valid reservation id'),
});

export const listReservationsQuerySchema = z.object({
  restaurant: restaurantSlugSchema.optional(),
  status: z
    .enum(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    .optional(),
  upcoming: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/** Admin-only: move a booking through its lifecycle. */
export const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  /**
   * Optimistic-lock check. The client echoes back the version it last read;
   * if another admin changed the row in between, the update is rejected
   * instead of silently overwriting their decision.
   */
  version: z.coerce.number().int().nonnegative().optional(),
});
