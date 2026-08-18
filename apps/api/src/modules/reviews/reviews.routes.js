import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { createReviewSchema, listReviewsQuerySchema } from './reviews.schemas.js';
import * as reviewsService from './reviews.service.js';

export const reviewsRouter = Router();

/** Public — the star histogram and review list on a venue page. */
reviewsRouter.get(
  '/',
  validate({ query: listReviewsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { restaurant, page, pageSize } = req.query;
    res.json(await reviewsService.listReviews(restaurant, { page, pageSize }));
  }),
);

/** Leaving a review requires an account — see reviews.service.js for why. */
reviewsRouter.post(
  '/',
  requireAuth,
  validate({ body: createReviewSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ review: await reviewsService.createReview(req.user.id, req.body) });
  }),
);
