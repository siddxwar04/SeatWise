import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../context/AuthContext.jsx';

function LoginPage() {
  const location = useLocation();
  return <div>Login page {location.state?.from ?? ''}</div>;
}

function HomePage() {
  return <div>Home page</div>;
}

function renderAt(path, auth) {
  useAuth.mockReturnValue({
    isAuthenticated: false,
    canAccessConsole: false,
    loading: false,
    ...auth,
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomePage />} />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <div>My bookings</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/console"
          element={
            <ProtectedRoute consoleOnly>
              <div>Owner console</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it('sends logged-out visitors from /bookings and /console to login', () => {
    const { unmount } = renderAt('/bookings', { isAuthenticated: false });
    expect(screen.getByText(/login page/i)).toBeInTheDocument();
    expect(screen.getByText(/\/bookings/)).toBeInTheDocument();
    unmount();

    renderAt('/console', { isAuthenticated: false });
    expect(screen.getByText(/login page/i)).toBeInTheDocument();
    expect(screen.getByText(/\/console/)).toBeInTheDocument();
  });

  it('keeps diners out of /console and lets owners in', () => {
    const { unmount } = renderAt('/console', {
      isAuthenticated: true,
      canAccessConsole: false,
    });
    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.queryByText('Owner console')).not.toBeInTheDocument();
    unmount();

    renderAt('/console', {
      isAuthenticated: true,
      canAccessConsole: true,
    });
    expect(screen.getByText('Owner console')).toBeInTheDocument();
  });

  it('shows a session check while auth is loading', () => {
    renderAt('/bookings', { loading: true });
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
  });
});
