import { Router } from 'express';
import { z } from 'zod';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { blockDemoWrites } from '../demo/demo.service.js';
import * as controller from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.schemas.js';

export const authRouter = Router();

// --- public -----------------------------------------------------------------
authRouter.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);

authRouter.post('/refresh', refreshLimiter, controller.refresh);

// One-click demo accounts for reviewers. 404s unless DEMO_LOGIN_ENABLED=true.
authRouter.get('/demo', controller.demoStatus);
authRouter.post(
  '/demo',
  refreshLimiter,
  validate({ body: z.object({ role: z.enum(['diner', 'owner']) }) }),
  controller.demoLogin,
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);

// Logout is intentionally public: an expired access token must not stop
// someone from ending their session. It authenticates via the refresh cookie.
authRouter.post('/logout', controller.logout);

// --- authenticated ----------------------------------------------------------
authRouter.get('/me', requireAuth, controller.me);

authRouter.patch(
  '/me',
  requireAuth,
  blockDemoWrites,
  validate({ body: updateProfileSchema }),
  controller.updateProfile,
);

authRouter.post(
  '/change-password',
  requireAuth,
  blockDemoWrites,
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

authRouter.post('/logout-all', requireAuth, controller.logoutAll);
