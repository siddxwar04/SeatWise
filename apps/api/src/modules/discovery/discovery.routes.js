import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { discoverRestaurants } from './discovery.service.js';
import { discoveryQuerySchema } from './discovery.schemas.js';

export const discoveryRouter = Router();

/** Public, read-only — the same directory a logged-out diner sees. */
discoveryRouter.get(
  '/',
  validate({ query: discoveryQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await discoverRestaurants(req.query));
  }),
);
