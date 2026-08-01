import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { isTest } from '../config/env.js';
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

function buildStore(prefix) {
  if (!isRedisReady()) return undefined;
  const client = getRedis();
  if (!client) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args) => client.call(...args),
  });
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
