/**
 * Auth.
 *
 * With `VITE_LIVE_API=true` this is the real thing: access token in memory,
 * refresh token in an httpOnly cookie, `/auth/*` endpoints (see lib/api.js).
 *
 * Without it, the app runs on a demo session so the whole product — including the
 * owner console, which is behind a role gate — is explorable from a static deploy
 * with no backend. Demo sessions are plainly labelled in the UI; they are not a
 * pretend security boundary.
 */

import { authApi, bootstrapSession, restaurantApi, setAccessToken } from '../lib/api.js';
import { listManagedVenues } from './console.js';
import { delay, LIVE_API, ServiceError, store } from './config.js';

const SESSION_KEY = 'session';

export const DEMO_ACCOUNTS = [
  {
    email: 'diner@seatwise.app',
    password: 'demo1234',
    role: 'GUEST',
    username: 'Aarav Sharma',
    label: 'Diner',
    blurb: 'Search, book, manage reservations',
  },
  {
    email: 'owner@seatwise.app',
    password: 'demo1234',
    role: 'RESTAURANT_ADMIN',
    username: 'Meera Iyer',
    label: 'Restaurant owner',
    blurb: 'Risk queue, overbooking, floor, analytics',
  },
];

function demoSession(account) {
  return {
    user: {
      id: `demo-${account.role.toLowerCase()}`,
      email: account.email,
      username: account.username,
      role: account.role,
      demo: true,
    },
  };
}

export async function restore() {
  if (LIVE_API) {
    const session = await bootstrapSession();
    if (!session?.user) return null;
    const venues = await fetchManaged();
    return { user: session.user, managedVenues: venues };
  }

  const saved = store.read(SESSION_KEY, null);
  if (!saved) return null;
  return { user: saved.user, managedVenues: await managedFor(saved.user) };
}

async function fetchManaged() {
  try {
    const data = await restaurantApi.mine();
    return data.restaurants ?? [];
  } catch {
    // A flaky network must not block a login; an empty list simply hides the
    // console until the next call succeeds.
    return [];
  }
}

async function managedFor(user) {
  if (user.role === 'ADMIN' || user.role === 'RESTAURANT_ADMIN') return listManagedVenues();
  return [];
}

export async function login({ email, password }) {
  if (LIVE_API) {
    const session = await authApi.login({ email, password });
    setAccessToken(session.accessToken);
    return { user: session.user, managedVenues: await fetchManaged() };
  }

  await delay(520);

  const account = DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());

  // One message for "no such account" and "wrong password" alike, matching the
  // server: any difference between the two lets anyone enumerate registered
  // emails.
  if (!account || account.password !== password) {
    if (password.length < 8) {
      throw new ServiceError('Check your email and password.', {
        code: 'INVALID_CREDENTIALS',
        details: { password: 'At least 8 characters.' },
      });
    }
    // Demo mode: an unknown email with a plausible password signs in as a diner
    // rather than dead-ending someone who just wants to look around.
    const guest = {
      user: {
        id: 'demo-guest',
        email: email.trim().toLowerCase(),
        username: email.split('@')[0].replace(/[._-]/g, ' '),
        role: 'GUEST',
        demo: true,
      },
    };
    store.write(SESSION_KEY, guest);
    return { user: guest.user, managedVenues: [] };
  }

  const session = demoSession(account);
  store.write(SESSION_KEY, session);
  return { user: session.user, managedVenues: await managedFor(session.user) };
}

export async function register({ username, email, password }) {
  if (LIVE_API) {
    const session = await authApi.register({ username, email, password });
    setAccessToken(session.accessToken);
    return { user: session.user, managedVenues: [] };
  }

  await delay(600);

  const details = {};
  if (!username?.trim()) details.username = 'What should the restaurant call you?';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) details.email = 'Enter a valid email address.';
  if ((password ?? '').length < 8) details.password = 'At least 8 characters.';
  if (Object.keys(details).length) {
    throw new ServiceError('Check the highlighted fields.', { code: 'VALIDATION', details });
  }

  const session = {
    user: {
      id: `demo-${Date.now()}`,
      email: email.trim().toLowerCase(),
      username: username.trim(),
      role: 'GUEST',
      demo: true,
    },
  };
  store.write(SESSION_KEY, session);
  return { user: session.user, managedVenues: [] };
}

export async function logout() {
  if (LIVE_API) {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
    }
    return;
  }
  await delay(180);
  store.clear(SESSION_KEY);
}
