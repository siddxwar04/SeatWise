import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { ConflictError, UnauthorizedError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  durationToMs,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../../lib/tokens.js';

/**
 * A precomputed bcrypt hash of a value nobody will ever submit.
 *
 * When login is attempted for an email that does not exist, we still run a
 * bcrypt comparison against this. Without it, a missing user returns in ~1ms
 * while a real user costs ~250ms of hashing — and that timing difference is a
 * user-enumeration oracle just as reliable as the "User not found!" alert the
 * legacy app displayed outright.
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equalisation-placeholder', env.BCRYPT_ROUNDS);

/** Everything the client is allowed to know about a user. Never the hash. */
function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Issues an access token and persists a hashed refresh token as a session row.
 * Called on register, login, and every refresh.
 */
async function issueSession(user, context = {}) {
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      userAgent: context.userAgent?.slice(0, 255) ?? null,
      ipAddress: context.ipAddress?.slice(0, 45) ?? null,
      expiresAt: new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL)),
    },
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    user: toPublicUser(user),
  };
}

export async function register(input, context) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  // Registration is the one place enumeration cannot be fully avoided: the
  // user has to be told the address is taken. The mitigation is the rate limit
  // on this route, not a vague message that would just confuse people.
  if (existing) {
    throw new ConflictError('An account with that email already exists.');
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      phone: input.phone ?? null,
      passwordHash: await bcrypt.hash(input.password, env.BCRYPT_ROUNDS),
    },
  });

  logger.info({ userId: user.id }, 'user registered');
  return issueSession(user, context);
}

export async function login(input, context) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always hash, whether or not the account exists — see DUMMY_HASH above.
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  /**
   * One message for both failure modes.
   *
   * The legacy app distinguished "User not found!" from "Invalid Password!"
   * and, worse, redirected to the register page on the former — so an attacker
   * could confirm which emails were registered without even reading the alert.
   */
  if (!user || !passwordMatches) {
    logger.warn({ email: input.email }, 'failed login attempt');
    throw new UnauthorizedError('Invalid email or password.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logger.info({ userId: user.id }, 'user logged in');
  return issueSession(user, context);
}

/**
 * Refresh with rotation: the presented token is revoked and a brand-new one
 * issued. A refresh token is therefore single-use.
 *
 * This is what makes theft detectable. If an attacker steals a token and uses
 * it, the legitimate client's next refresh presents an already-revoked token —
 * which we treat as a compromise and respond to by killing every session for
 * that user.
 */
export async function refresh(presentedToken, context) {
  if (!presentedToken) {
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presentedToken) },
    include: { user: true },
  });

  if (!stored) {
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }

  if (stored.revokedAt) {
    logger.error(
      { userId: stored.userId },
      'revoked refresh token replayed — revoking all sessions for this user',
    );
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }

  if (stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(stored.user, context);
}

export async function logout(presentedToken) {
  if (!presentedToken) return;

  // updateMany, not update: a token that is already gone is not an error, and
  // logging out twice should be idempotent rather than a 404.
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** "Sign out of all devices". Also what a password change triggers. */
export async function logoutAllSessions(userId) {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  logger.info({ userId, sessions: result.count }, 'all sessions revoked');
  return result.count;
}

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError('Account no longer exists.');
  return toPublicUser(user);
}

export async function updateProfile(userId, input) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.username !== undefined && { username: input.username }),
      ...(input.phone !== undefined && { phone: input.phone }),
    },
  });
  return toPublicUser(user);
}

export async function changePassword(userId, input) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError('Account no longer exists.');

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new UnauthorizedError('Your current password is incorrect.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS) },
  });

  // A password change must invalidate sessions elsewhere, otherwise changing
  // it after a compromise does not actually lock the attacker out.
  await logoutAllSessions(userId);
  logger.info({ userId }, 'password changed — all sessions revoked');
}

/**
 * Housekeeping for expired and revoked rows. Called from a scheduled job in
 * Phase 9; harmless to run at any time.
 */
export async function pruneExpiredTokens() {
  const cutoff = new Date(Date.now() - 86_400_000);
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
    },
  });
  return result.count;
}
