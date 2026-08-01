import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Two different tokens, on purpose:
 *
 *   Access token  — a short-lived signed JWT. Stateless, so every request can
 *                   be authorised without a database round trip. The cost of
 *                   statelessness is that it cannot be revoked, which is why
 *                   it only lives 15 minutes.
 *
 *   Refresh token — a long-lived opaque random string, stored HASHED in the
 *                   `refresh_tokens` table. Because there is a row, it CAN be
 *                   revoked: logout deletes it and the session really ends.
 *                   The legacy app had no logout at all — once you were in,
 *                   the only way out was closing the browser.
 */

/** Converts "15m" / "7d" / "30s" to milliseconds. */
export function durationToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

export function signAccessToken(user) {
  return jwt.sign(
    { email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      expiresIn: env.ACCESS_TOKEN_TTL,
      issuer: 'tastyfood',
      audience: 'tastyfood-web',
    },
  );
}

/**
 * Returns the decoded payload, or null if the token is missing, expired,
 * tampered with, or signed for a different issuer/audience.
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'tastyfood',
      audience: 'tastyfood-web',
    });
  } catch {
    return null;
  }
}

/** 384 bits of CSPRNG output. Not a JWT — it carries no claims, just entropy. */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * SHA-256, not bcrypt.
 *
 * Bcrypt is deliberately slow to make brute-forcing low-entropy human
 * passwords expensive. A refresh token is 384 random bits — there is nothing
 * to brute-force, so the slow KDF would only add latency to every refresh.
 * Hashing at all is what matters: a leaked database dump must not contain
 * usable session tokens.
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const REFRESH_COOKIE_NAME = 'tf_refresh';

/**
 * SameSite=strict blocks the cookie on any cross-site request, which is what
 * stops a third-party page from silently calling /api/auth/refresh in the
 * user's context. That is the CSRF defence for this endpoint.
 *
 * The path scope means the cookie is only ever sent to the two routes that
 * need it, so an XSS elsewhere on the site cannot read it via fetch either
 * (httpOnly already blocks document.cookie).
 */
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: durationToMs(env.REFRESH_TOKEN_TTL),
  };
}
