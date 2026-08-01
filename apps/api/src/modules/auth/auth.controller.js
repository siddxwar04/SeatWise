import { asyncHandler } from '../../lib/asyncHandler.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../../lib/tokens.js';
import * as authService from './auth.service.js';

/**
 * Controllers do three things and nothing else: read the request, call a
 * service, shape the response. All business rules live in the service so they
 * can be tested without an HTTP layer.
 */
function requestContext(req) {
  return { userAgent: req.get('user-agent') ?? undefined, ipAddress: req.ip };
}

/**
 * The refresh token goes into an httpOnly cookie; the access token goes in the
 * JSON body for the client to hold in memory.
 *
 * Neither token is written to localStorage. Anything in localStorage is
 * readable by any script on the page, so a single XSS becomes a permanent
 * account takeover — and this codebase shipped a stored XSS once already.
 */
function sendSession(res, session, statusCode = 200) {
  res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, refreshCookieOptions());
  res.status(statusCode).json({
    user: session.user,
    accessToken: session.accessToken,
  });
}

export const register = asyncHandler(async (req, res) => {
  const session = await authService.register(req.body, requestContext(req));
  sendSession(res, session, 201);
});

export const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body, requestContext(req));
  sendSession(res, session);
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE_NAME];
  const session = await authService.refresh(presented, requestContext(req));
  sendSession(res, session);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
  // Clearing requires the same attributes the cookie was set with, or the
  // browser treats it as a different cookie and leaves the original in place.
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).send();
});

export const logoutAll = asyncHandler(async (req, res) => {
  const count = await authService.logoutAllSessions(req.user.id);
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
  res.json({ revokedSessions: count });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: await authService.getProfile(req.user.id) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  res.json({ user: await authService.updateProfile(req.user.id, req.body) });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
  res.json({ message: 'Password updated. Please sign in again.' });
});
