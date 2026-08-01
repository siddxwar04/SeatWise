import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Redis backs the cache-aside layer (menu, availability) and the rate-limit
 * counters. It is deliberately optional: if Redis is down the API degrades to
 * hitting Postgres directly and to in-memory rate limiting rather than
 * returning 500s. A cache outage should not be an application outage.
 */
let client = null;
let unavailableLogged = false;

export function getRedis() {
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
  });

  client.on('error', (err) => {
    if (!unavailableLogged) {
      logger.warn({ err: err.message }, 'redis unavailable — continuing without cache');
      unavailableLogged = true;
    }
  });

  client.on('ready', () => {
    unavailableLogged = false;
    logger.info('redis connected');
  });

  client.connect().catch(() => {
    /* handled by the error listener above */
  });

  return client;
}

export function isRedisReady() {
  return client?.status === 'ready';
}

export async function disconnectRedis() {
  if (client) {
    await client.quit().catch(() => client?.disconnect());
    client = null;
  }
}
