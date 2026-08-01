/**
 * API client.
 *
 * The access token is held in a module-level variable — in memory only, never
 * in localStorage. Anything in localStorage is readable by any script that
 * runs on the page, so one XSS becomes a permanent account takeover. This
 * codebase shipped a stored XSS once already; the refresh token lives in an
 * httpOnly cookie that JavaScript cannot touch at all.
 *
 * The cost is that a page refresh loses the access token, which is why
 * bootstrapSession() silently trades the cookie for a fresh one on load.
 */

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Thrown for any non-2xx response. Carries the server's structured error. */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    /** Field-level messages: { "email": "Enter a valid email address" } */
    this.details = body?.error?.details ?? null;
  }
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

/**
 * Single-flight refresh.
 *
 * If three requests 401 at the same moment, all three await the SAME refresh
 * promise instead of firing three refresh calls. That matters because refresh
 * tokens rotate — three concurrent refreshes would invalidate each other and
 * the server would read it as token replay and kill every session.
 */
let refreshInFlight = null;

function refreshSession() {
  refreshInFlight ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, await parseBody(res));
      const data = await res.json();
      setAccessToken(data.accessToken);
      return data;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function request(path, { method = 'GET', body, retryOnUnauthorised = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // One transparent retry after refreshing. Without this, every session would
  // visibly break the moment the 15-minute access token expired.
  if (response.status === 401 && retryOnUnauthorised) {
    try {
      await refreshSession();
      return request(path, { method, body, retryOnUnauthorised: false });
    } catch {
      setAccessToken(null);
      throw new ApiError(401, { error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } });
    }
  }

  const payload = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// --- endpoints --------------------------------------------------------------

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/auth/me', data),
  changePassword: (data) => api.post('/auth/change-password', data),
};

export const menuApi = {
  list: (restaurant, category) => {
    const params = new URLSearchParams({ restaurant });
    if (category) params.set('category', category);
    return api.get(`/menu?${params}`);
  },
  listAll: (restaurant) =>
    api.get(`/menu?${new URLSearchParams({ restaurant, includeUnavailable: 'true' })}`),
  create: (data) => api.post('/menu', data),
  update: (id, data) => api.patch(`/menu/${id}`, data),
  setAvailability: (id, isAvailable) => api.patch(`/menu/${id}/availability`, { isAvailable }),
  remove: (id) => api.delete(`/menu/${id}`),
  safe: (params) => api.get(`/menu/safe?${new URLSearchParams(params)}`),
};

export const reservationApi = {
  rules: () => api.get('/reservations/rules'),
  availability: (restaurant, date, partySize) =>
    api.get(`/reservations/availability?${new URLSearchParams({ restaurant, date, partySize })}`),
  create: (data) => api.post('/reservations', data),
  mine: (params = {}) => api.get(`/reservations/mine?${new URLSearchParams(params)}`),
  cancel: (id) => api.post(`/reservations/${id}/cancel`),
  lookup: (reference, phone) => api.post('/reservations/lookup', { reference, phone }),
};

export const restaurantApi = {
  list: () => api.get('/restaurants'),
  /** Venues the current user may administer (ADMIN → all; else RestaurantAdmin). */
  mine: () => api.get('/restaurants/mine'),
  get: (slug) => api.get(`/restaurants/${slug}`),
};

export const adminApi = {
  reservations: (params = {}) => api.get(`/admin/reservations?${new URLSearchParams(params)}`),
  updateStatus: (id, status, version, restaurant) =>
    api.patch(`/admin/reservations/${id}/status?${new URLSearchParams({ restaurant })}`, {
      status,
      version,
    }),
  today: (restaurant) => api.get(`/admin/service/today?${new URLSearchParams({ restaurant })}`),
  stats: (restaurant, days = 30) =>
    api.get(`/admin/stats?${new URLSearchParams({ restaurant, days })}`),
};

/** Default venue for the marketing site until a picker is wired. */
export const DEFAULT_RESTAURANT_SLUG = 'tastyfood-koramangala';

/**
 * Called once at startup. A valid refresh cookie yields a new access token and
 * the user stays signed in across reloads; anything else means signed out,
 * which is not an error worth surfacing.
 */
export async function bootstrapSession() {
  try {
    return await refreshSession();
  } catch {
    return null;
  }
}
