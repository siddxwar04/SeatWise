import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { isRedisReady } from '../lib/redis.js';

export const healthRouter = Router();

/** Liveness — is the process up? Deliberately does not touch dependencies. */
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/**
 * Readiness — can this instance actually serve traffic?
 * Postgres is required; Redis is not, because the cache layer degrades
 * gracefully. Reporting "degraded" instead of "down" for a Redis outage keeps
 * the load balancer from pulling a perfectly serviceable instance.
 */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks = { database: 'down', redis: 'down' };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    checks.redis = isRedisReady() ? 'up' : 'down';

    const status = checks.database === 'up' ? (checks.redis === 'up' ? 'ok' : 'degraded') : 'down';
    res.status(status === 'down' ? 503 : 200).json({ status, checks });
  }),
);
