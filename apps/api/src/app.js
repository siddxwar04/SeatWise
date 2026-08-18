import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { discoveryRouter } from './modules/discovery/discovery.routes.js';
import { menuRouter } from './modules/menu/menu.routes.js';
import { reservationRouter } from './modules/reservations/reservation.routes.js';
import { restaurantRouter } from './modules/restaurants/restaurant.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import { waitlistRouter } from './modules/waitlist/waitlist.routes.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  // Behind Railway/Render/Nginx the client IP arrives in X-Forwarded-For.
  // Rate limiting is worthless without this — every request would appear to
  // come from the proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; CSP is enforced on the web app, which knows
      // its own asset origins.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      // Required for the httpOnly refresh-token cookie to travel.
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      maxAge: 86_400,
    }),
  );

  app.use(compression());
  // 100kb is generous for this API's largest payload and caps trivial
  // memory-exhaustion attempts.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Successful requests are noise at info level; failures are not.
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug',
      }),
    );
  }

  // Health checks sit outside the rate limiter — a load balancer polling
  // /health/ready every few seconds must never be throttled.
  app.use('/health', healthRouter);

  app.use('/api', generalLimiter);

  app.get('/api', (_req, res) => {
    res.json({ name: 'TastyFood API', version: '2.0.0' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/restaurants', restaurantRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/reservations', reservationRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/waitlist', waitlistRouter);
  app.use('/api/chat', chatRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
