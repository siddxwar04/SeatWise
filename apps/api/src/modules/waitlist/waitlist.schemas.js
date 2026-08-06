import { z } from 'zod';
import { restaurantSlugSchema } from '../reservations/reservation.schemas.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That date does not exist');

const slotTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time from the list');

export const joinWaitlistSchema = z.object({
  restaurantSlug: restaurantSlugSchema,
  guestName: z.string().trim().min(2).max(80),
  guestPhone: z
    .string()
    .trim()
    .regex(/^(?:\+?91[- ]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .transform((v) => v.replace(/\D/g, '').slice(-10)),
  guestEmail: z.string().trim().toLowerCase().email().max(254),
  date: isoDate,
  time: slotTime,
  partySize: z.coerce.number().int().min(1).max(20),
});
