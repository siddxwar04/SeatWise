import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard.
 *
 * This is a convenience, not a security boundary — anyone can edit client
 * state. Every protected endpoint enforces requireAuth/requireRestaurantAdmin
 * on the server independently, which is where authorisation actually happens.
 *
 * adminOnly allows global ADMIN and venue managers (RestaurantAdmin rows
 * loaded via GET /restaurants/mine after auth — never from the JWT).
 */
export function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, canAccessAdmin, loading } = useAuth();
  const location = useLocation();

  // Wait for the session restore, or a signed-in user hitting refresh on
  // /admin would be bounced to the login page for a moment.
  if (loading) {
    return <p className="menu_state">Checking your session…</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (adminOnly && !canAccessAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
