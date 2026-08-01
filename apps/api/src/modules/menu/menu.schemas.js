import { z } from 'zod';

const ALLERGENS = [
  'GLUTEN',
  'DAIRY',
  'EGG',
  'PEANUT',
  'TREE_NUT',
  'SOY',
  'FISH',
  'SHELLFISH',
  'SESAME',
];

const DIETARY_TAGS = [
  'VEGETARIAN',
  'VEGAN',
  'JAIN',
  'HALAL',
  'CONTAINS_EGG',
  'NON_VEGETARIAN',
  'SPICY',
];

const CATEGORIES = ['BREAKFAST', 'LUNCH', 'DESSERT'];

const restaurantSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Restaurant slug must be lowercase hyphenated words');

/** Accepts "GLUTEN,TREE_NUT" from a query string as well as a real array. */
const csvEnum = (values) =>
  z
    .union([z.string(), z.array(z.enum(values))])
    .optional()
    .transform((v) => {
      if (!v) return [];
      const list = Array.isArray(v) ? v : v.split(',');
      return list.map((s) => s.trim().toUpperCase()).filter((s) => values.includes(s));
    });

export const listMenuQuerySchema = z.object({
  restaurant: restaurantSlug,
  category: z.enum(CATEGORIES).optional(),
  /** Admin-only flag — public callers never see 86'd dishes. */
  includeUnavailable: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});

export const safeMenuQuerySchema = z.object({
  restaurant: restaurantSlug,
  category: z.enum(CATEGORIES).optional(),
  excludeAllergens: csvEnum(ALLERGENS),
  requireTags: csvEnum(DIETARY_TAGS),
});

export const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(80),
});

export const menuIdParamSchema = z.object({
  id: z.string().uuid('Not a valid menu item id'),
});

export const createMenuItemSchema = z.object({
  restaurantSlug: restaurantSlug,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(600),
  price: z.coerce.number().positive('Price must be greater than zero').max(100_000),
  category: z.enum(CATEGORIES),
  imageUrl: z.string().trim().min(1).max(255),
  imageAlt: z.string().trim().min(2).max(160),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  dietaryTags: z.array(z.enum(DIETARY_TAGS)).default([]),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateMenuItemSchema = createMenuItemSchema.omit({ restaurantSlug: true }).partial();

export const availabilityBodySchema = z.object({
  isAvailable: z.boolean(),
});
