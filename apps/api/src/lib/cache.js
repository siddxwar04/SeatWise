import { getRedis, isRedisReady } from './redis.js';
import { logger } from './logger.js';

/**
 * Cache-aside (lazy loading).
 *
 *   read:  try cache -> miss -> read database -> write cache -> return
 *   write: change database -> DELETE the key (do not update it)
 *
 * Invalidate by deletion rather than by writing the new value. Two concurrent
 * updates that both write to the cache can land in the opposite order they hit
 * the database, leaving the cache permanently disagreeing with the source of
 * truth. Deleting is idempotent — the next read just repopulates.
 *
 * Every function here degrades to "no cache" if Redis is unavailable. A cache
 * outage must not be an application outage.
 */

export async function cached(key, ttlSeconds, loader) {
  if (!isRedisReady()) return loader();

  const redis = getRedis();
  if (!redis) return loader();

  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache read failed — falling through to database');
  }

  const value = await loader();

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache write failed');
  }

  return value;
}

/** Drops keys by prefix. Uses SCAN, never KEYS — KEYS blocks the whole server. */
export async function invalidatePrefix(prefix) {
  if (!isRedisReady()) return 0;
  const redis = getRedis();
  if (!redis) return 0;

  let cursor = '0';
  let removed = 0;

  try {
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
        removed += keys.length;
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err: err.message, prefix }, 'cache invalidation failed');
  }

  return removed;
}

export const CACHE_KEYS = {
  // Restaurant id is part of every key so invalidating one venue cannot
  // leave another venue serving a stale shared blob.
  menuAll: (restaurantId) => `menu:${restaurantId}:all`,
  menuByCategory: (restaurantId, category) => `menu:${restaurantId}:cat:${category}`,
  menuPrefix: (restaurantId) => `menu:${restaurantId}:`,
  overbookingDay: (restaurantId, date) => `overbooking:${restaurantId}:${date}`,
  overbookingPrefix: (restaurantId) => `overbooking:${restaurantId}:`,
};
