import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { optionalAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { joinWaitlistSchema } from './waitlist.schemas.js';
import * as waitlistService from './waitlist.service.js';

export const waitlistRouter = Router();

waitlistRouter.post(
  '/',
  writeLimiter,
  optionalAuth,
  validate({ body: joinWaitlistSchema }),
  asyncHandler(async (req, res) => {
    const result = await waitlistService.joinWaitlist(req.body, req.user ?? null);
    res.status(201).json(result);
  }),
);
