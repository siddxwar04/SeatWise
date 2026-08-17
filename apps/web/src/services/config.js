/**
 * How the UI gets its data.
 *
 * The frontend is being built ahead of the multi-tenant API, so every screen
 * currently reads the fixture layer in `src/data`. That is a deliberate seam, not
 * a shortcut:
 *
 *   - Components never see fixtures. They call a service function and receive a
 *     promise, which means they already have real loading, empty and error states
 *     rather than states that get bolted on the day the API lands.
 *   - Each service function that has a matching endpoint documents it and routes
 *     through lib/api.js when `VITE_LIVE_API=true`. Turning that flag on is the
 *     whole migration for those calls.
 *   - Search and the owner console have no endpoint yet (availability search
 *     across venues and the risk/overbooking panels are the next backend step),
 *     so they are fixture-only and say so at the call site.
 */

export const LIVE_API = import.meta.env.VITE_LIVE_API === 'true';

/**
 * Simulated latency.
 *
 * Fixtures resolve instantly, which hides every loading state and makes skeletons
 * impossible to see, let alone judge. A small delay keeps the async shape of the
 * real thing — and jitter matters too: a fixed 300 ms makes staggered lists look
 * synchronised in a way no network ever is.
 */
export function delay(ms = 260) {
  const jitter = ms * 0.35;
  return new Promise((resolve) => setTimeout(resolve, ms - jitter / 2 + Math.random() * jitter));
}

/** Errors the UI is expected to render, as opposed to bugs. */
export class ServiceError extends Error {
  constructor(message, { code = 'SERVICE_ERROR', details = null } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Namespaced localStorage, tolerant of blocked storage.
 *
 * Demo bookings persist across reloads — cancel a booking, refresh, and it is
 * still cancelled. Without that the booking flow ends in a screen that evaporates,
 * which is exactly the thing that makes a portfolio demo feel like a mock-up.
 */
const NS = 'seatwise';

export const store = {
  read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(`${NS}.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(`${NS}.${key}`, JSON.stringify(value));
    } catch {
      // Private mode. The session keeps working in memory for this tab.
    }
    return value;
  },
  clear(key) {
    try {
      window.localStorage.removeItem(`${NS}.${key}`);
    } catch {
      /* no-op */
    }
  },
};
