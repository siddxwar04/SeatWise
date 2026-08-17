import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as session from '../services/session.js';

const AuthContext = createContext(null);

/**
 * Session state.
 *
 * `managedVenues` is loaded separately from the user rather than read off a token
 * claim: venue membership changes should take effect on the next request, not
 * whenever the access token happens to expire.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [managedVenues, setManagedVenues] = useState([]);
  // Starts true so the navbar does not flash "Sign in" for a signed-in user
  // during the one-request session restore.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    session
      .restore()
      .then((restored) => {
        if (cancelled || !restored) return;
        setUser(restored.user);
        setManagedVenues(restored.managedVenues ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await session.login(credentials);
    setUser(result.user);
    setManagedVenues(result.managedVenues ?? []);
    return result;
  }, []);

  const register = useCallback(async (data) => {
    const result = await session.register(data);
    setUser(result.user);
    setManagedVenues([]);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await session.logout();
    } finally {
      // Clear locally even if the request failed — the user asked to sign out and
      // the UI must reflect that regardless of the network.
      setUser(null);
      setManagedVenues([]);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      managedVenues,
      isAuthenticated: user !== null,
      /** Global admin, or manages at least one venue. */
      canAccessConsole:
        user?.role === 'ADMIN' || user?.role === 'RESTAURANT_ADMIN' || managedVenues.length > 0,
      isDemo: Boolean(user?.demo),
    }),
    [user, loading, login, register, logout, managedVenues],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
