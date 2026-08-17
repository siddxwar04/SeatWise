import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard.
 *
 * A convenience, not a security boundary — anyone can edit client state. Every
 * protected endpoint enforces its own check server-side; this only avoids
 * flashing a page the visitor cannot use.
 */
export function ProtectedRoute({ children, consoleOnly = false }) {
  const { isAuthenticated, canAccessConsole, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="menu_state">Checking your session…</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (consoleOnly && !canAccessConsole) {
    return <Navigate to="/" replace />;
  }

  return children;
}
