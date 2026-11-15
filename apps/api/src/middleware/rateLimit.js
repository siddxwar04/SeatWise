import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env, isTest } from '../config/env.js';
import { TooManyRequestsError } from '../errors/AppError.js';
import { getRedis, isRedisReady } from '../lib/redis.js';

/**
 * Rate limiting closes audit finding #10 — unlimited login attempts.
 *
 * Redis backs the counters when it is available so the limit holds across
 * multiple API instances. When it is not, express-rate-limit falls back to its
 * in-memory store: weaker (per-process) but still far better than nothing, and
 * it means a Redis outage cannot take the API down.
 */

/**
 * Collapses an address to the unit we actually want to limit.
 *
 * IPv4 is used whole. IPv6 is truncated to its /64 prefix, because a single
 * customer is routinely handed a /64 (or larger) allocation — keying on the
 * full address would let one person rotate through billions of addresses and
 * walk straight past the limit.
 */
export function normaliseIp(rawIp) {
  if (!rawIp) return 'unknown';

  // Strip any zone index, e.g. fe80::1%eth0
  const ip = rawIp.split('%')[0];

  if (!ip.includes(':')) return ip;

  // IPv4-mapped IPv6, e.g. ::ffff:203.0.113.5 — treat as the IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];

  // Expand the "::" shorthand to a full 8-group address before truncating.
  let groups;
  if (ip.includes('::')) {
    const [head = '', tail = ''] = ip.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = Math.max(0, 8 - headParts.length - tailParts.length);
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    groups = ip.split(':');
  }

  const prefix = groups
    .slice(0, 4)
    .map((g) => (g === '' ? '0' : g.toLowerCase()))
    .join(':');

  return `${prefix}::/64`;
}

/**
 * Limiters are created at import time, before Redis has connected, so the
 * choice of store cannot be made once up front — it would always be "memory".
 * This store decides per request: Redis while it is ready, the in-memory
 * counters otherwise (and whenever a Redis command fails mid-flight).
 */
class RedisOrMemoryStore {
  // Counters may live in Redis, so they are not local to this process.
  localKeys = false;

  constructor(prefix) {
    this.prefix = `rl:${prefix}:`;
    this.memory = new MemoryStore();
    this.redis = null;
    this.options = null;
  }

  init(options) {
    this.options = options;
    this.memory.init(options);
  }

  redisStore() {
    if (!isRedisReady()) return null;
    if (!this.redis) {
      const client = getRedis();
      this.redis = new RedisStore({
        prefix: this.prefix,
        sendCommand: (...args) => client.call(...args),
      });
      this.redis.init(this.options);
      // The store loads its Lua scripts in the constructor. If Redis drops in
      // that instant the promises reject with nobody awaiting them; the store
      // reloads them on the next command, so the rejection is safe to swallow.
      this.redis.incrementScriptSha?.catch(() => {});
      this.redis.getScriptSha?.catch(() => {});
    }
    return this.redis;
  }

  async run(method, key) {
    const redis = this.redisStore();
    if (redis) {
      try {
        return await redis[method](key);
      } catch {
        // Fall through — a Redis blip must not take the API down.
      }
    }
    return this.memory[method](key);
  }

  increment(key) {
    return this.run('increment', key);
  }

  decrement(key) {
    return this.run('decrement', key);
  }

  resetKey(key) {
    return this.run('resetKey', key);
  }

  shutdown() {
    this.memory.shutdown();
  }
}

function buildStore(prefix) {
  return new RedisOrMemoryStore(prefix);
}

function createLimiter({ name, windowMs, max, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    // Tests would otherwise trip the limiter and fail for the wrong reason.
    skip: () => isTest,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: buildStore(name),
    keyGenerator: keyGenerator ?? ((req) => normaliseIp(req.ip)),
    handler: (_req, _res, next) => next(new TooManyRequestsError(message)),
  });
}

/**
 * Login and registration. Keyed on IP *and* submitted email, so one attacker
 * cannot lock out a legitimate user by hammering their address from a
 * different IP — the two form independent buckets.
 */
export const authLimiter = createLimiter({
  name: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
  keyGenerator: (req) => {
    const ip = normaliseIp(req.ip);
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anonymous';
    return `${ip}:${email}`;
  },
});

/** Refresh is called automatically by the client, so the ceiling is higher. */
export const refreshLimiter = createLimiter({
  name: 'refresh',
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many requests. Please wait a moment.',
});

/** Writes that create real rows — bookings, cancellations. */
export const writeLimiter = createLimiter({
  name: 'write',
  windowMs: 60 * 1000,
  max: 20,
  message: 'You are doing that too often. Please wait a minute.',
});

/** Broad ceiling for everything else. */
export const generalLimiter = createLimiter({
  name: 'general',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many requests. Please slow down.',
});

/** AI concierge — OpenAI calls are metered; keep this tighter than general. */
export const aiLimiter = createLimiter({
  name: 'ai',
  windowMs: 60 * 60 * 1000,
  max: env.AI_RATE_LIMIT_PER_HOUR,
  message: 'You have reached the hourly concierge limit. Please try again later.',
});
