import { z } from 'zod';

/**
 * Self-serve "list your restaurant" — the owner-onboarding gap the audit's
 * successor app never had at all: every venue was seeded by hand. A signed-in
 * user posting here becomes that restaurant's RestaurantAdmin in the same
 * transaction (see restaurant.service.js#createRestaurant), so the owner
 * console is reachable the moment this call returns.
 */

const name = z.string().trim().min(2, 'Restaurant name is required').max(120);

const address = z.string().trim().min(4, 'Address is required').max(255);

const phone = z
  .string()
  .trim()
  .regex(/^(?:\+?91[- ]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
  .transform((v) => v.replace(/\D/g, '').slice(-10));

const citySlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z]+$/, 'City must be a lowercase slug, e.g. "pune"');

const area = z.string().trim().min(2, 'Area / neighbourhood is required').max(80);

const cuisine = z.string().trim().min(2).max(80).default('Indian');

export const createRestaurantSchema = z.object({
  name,
  address,
  phone,
  city: citySlug,
  area,
  cuisine: cuisine.optional(),
  priceLevel: z.coerce.number().int().min(1).max(4).optional().default(2),
  tagline: z.string().trim().max(200).optional(),
  about: z.string().trim().max(1000).optional(),
});
