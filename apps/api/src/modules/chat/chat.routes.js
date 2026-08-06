import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { chatBodySchema } from './chat.schemas.js';
import * as chatService from './chat.service.js';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Public concierge — no auth required so guests can ask before signing up.
 */
chatRouter.post(
  '/',
  aiLimiter,
  validate({ body: chatBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await chatService.chat(req.body);
    res.json(result);
  }),
);
