import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, bootstrapSession, setAccessToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true so the navbar does not flash "Log In" for a signed-in user
  // during the one-request session restore.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    bootstrapSession()
      .then((session) => {
        if (!cancelled && session?.user) setUser(session.user);
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
    return session.user;
  }, []);

  const register = useCallback(async (data) => {
    const session = await authApi.register(data);
    setAccessToken(session.accessToken);
    setUser(session.user);
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
      isAuthenticated: user !== null,
      isAdmin: user?.role === 'ADMIN',
    }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
