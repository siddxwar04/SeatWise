import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, bootstrapSession, restaurantApi, setAccessToken } from '../lib/api.js';

const AuthContext = createContext(null);

/**
 * Loads venues the user can staff-manage. Kept out of the JWT on purpose —
 * membership changes take effect on the next call without waiting for token
 * expiry. Failures yield an empty list so a flaky network never blocks login.
 */
async function fetchManagedRestaurants() {
  try {
    const data = await restaurantApi.mine();
    return data.restaurants ?? [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [managedRestaurants, setManagedRestaurants] = useState([]);
  // Starts true so the navbar does not flash "Log In" for a signed-in user
  // during the one-request session restore.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    bootstrapSession()
      .then(async (session) => {
        if (cancelled || !session?.user) return;
        setUser(session.user);
        const venues = await fetchManagedRestaurants();
        if (!cancelled) setManagedRestaurants(venues);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const session = await authApi.login(credentials);
    setAccessToken(session.accessToken);
    setUser(session.user);
    const venues = await fetchManagedRestaurants();
    setManagedRestaurants(venues);
    return { user: session.user, managedRestaurants: venues };
  }, []);

  const register = useCallback(async (data) => {
    const session = await authApi.register(data);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setManagedRestaurants([]);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Clear locally even if the request failed — the user asked to sign out
      // and the UI must reflect that regardless of the network.
      setAccessToken(null);
      setUser(null);
      setManagedRestaurants([]);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      setUser,
      managedRestaurants,
      isAuthenticated: user !== null,
      isAdmin: user?.role === 'ADMIN',
      /** Global ADMIN or at least one RestaurantAdmin membership. */
      canAccessAdmin: user?.role === 'ADMIN' || managedRestaurants.length > 0,
    }),
    [user, loading, login, register, logout, managedRestaurants],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
