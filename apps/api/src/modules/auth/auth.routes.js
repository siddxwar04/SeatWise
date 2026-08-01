import { Router } from 'express';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from './auth.schemas.js';

export const authRouter = Router();

// --- public -----------------------------------------------------------------
authRouter.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);

authRouter.post('/refresh', refreshLimiter, controller.refresh);

// Logout is intentionally public: an expired access token must not stop
// someone from ending their session. It authenticates via the refresh cookie.
authRouter.post('/logout', controller.logout);

// --- authenticated ----------------------------------------------------------
authRouter.get('/me', requireAuth, controller.me);

authRouter.patch(
  '/me',
  requireAuth,
  validate({ body: updateProfileSchema }),
  controller.updateProfile,
);

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

authRouter.post('/logout-all', requireAuth, controller.logoutAll);
