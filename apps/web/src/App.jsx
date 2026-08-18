import { useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/layout/Footer.jsx';
import { Navbar } from './components/layout/Navbar.jsx';
import { ConciergeWidget } from './components/concierge/ConciergeWidget.jsx';
import { PageTransition } from './components/PageTransition.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { MarketProvider } from './context/MarketContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { BookingConfirmPage } from './pages/BookingConfirmPage.jsx';
import { ConsolePage } from './pages/console/ConsolePage.jsx';
import { DiscoverPage } from './pages/DiscoverPage.jsx';
import { ForRestaurantsPage } from './pages/ForRestaurantsPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { MyBookingsPage } from './pages/MyBookingsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { VenuePage } from './pages/VenuePage.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/landing.css';
import './styles/discover.css';
import './styles/venue.css';
import './styles/console.css';
import './styles/marketing.css';
import './styles/auth.css';
import './styles/concierge.css';

const LANDING_SEEN_KEY = 'seatwise.landingSeen';

/**
 * Gate in front of the discover page. Not routing complexity — one extra
 * screen, entered once per browser session, before the existing city
 * experience takes over exactly as it did before this existed.
 */
function Home() {
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem(LANDING_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (entered) return <DiscoverPage />;

  return (
    <LandingPage
      onContinue={() => {
        try {
          sessionStorage.setItem(LANDING_SEEN_KEY, '1');
        } catch {
          // Safari private mode throws on write; re-showing the landing page
          // once more is harmless.
        }
        setEntered(true);
      }}
    />
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <PageTransition>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/r/:slug" element={<VenuePage />} />
        <Route path="/for-restaurants" element={<ForRestaurantsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <MyBookingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/bookings/:reference" element={<BookingConfirmPage />} />
        <Route
          path="/console/*"
          element={
            <ProtectedRoute consoleOnly>
              <ConsolePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </PageTransition>
  );
}

function Shell() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content">
        <AppRoutes />
      </main>

      <Footer />
      <ConciergeWidget />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MarketProvider>
            <ToastProvider>
              <Shell />
            </ToastProvider>
          </MarketProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
