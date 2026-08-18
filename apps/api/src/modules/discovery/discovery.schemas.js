import { z } from 'zod';
import { env } from '../../config/env.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That date does not exist');

const slotTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time from the list');

/** Comma-separated multi-select filters, e.g. "Bandra West,Colaba". */
const csv = z.string().trim().min(1).max(300).optional();

/**
 * City is required — the discovery grid is always scoped to one city, matching
 * the frontend's Discover page (one city in view at a time, switched via the
 * city picker rather than a global cross-city search).
 */
export const discoveryQuerySchema = z.object({
  city: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z]+$/, 'City must be a lowercase slug, e.g. "pune"'),
  date: isoDate.optional(),
  time: slotTime.optional(),
  party: z.coerce.number().int().min(1).max(env.MAX_PARTY_SIZE).optional(),
  cuisine: csv,
  price: csv,
  area: csv,
  q: z.string().trim().max(120).optional(),
  /** tonight | outdoor | group — see discovery.service.js for what each checks. */
  quick: csv,
  sort: z.enum(['relevance', 'availability', 'price-asc', 'price-desc']).optional(),
});
