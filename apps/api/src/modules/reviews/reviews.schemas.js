import { z } from 'zod';
import { restaurantSlugSchema } from '../reservations/reservation.schemas.js';

export const listReviewsQuerySchema = z.object({
  restaurant: restaurantSlugSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const createReviewSchema = z.object({
  reservationId: z.string().uuid('Not a valid reservation id'),
  stars: z.coerce
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be between 1 and 5 stars')
    .max(5, 'Rating must be between 1 and 5 stars'),
  body: z.string().trim().max(1000, 'Keep reviews under 1000 characters').optional(),
});
