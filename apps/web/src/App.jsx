import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ChatWidget } from './components/ChatWidget.jsx';
import { Footer } from './components/Footer.jsx';
import { Navbar } from './components/Navbar.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { MyReservationsPage } from './pages/MyReservationsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import './styles/tokens.css';
import './styles/style.css';
import './styles/app.css';
import './styles/polish.css';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {/* Audit #29: the site was not keyboard navigable and had no skip
              link. This is the first thing a keyboard user reaches. */}
          <a href="#main-content" className="skip_link">
            Skip to main content
          </a>

          <Navbar />

          <div id="main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/my-reservations"
                element={
                  <ProtectedRoute>
                    <MyReservationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>

          <Footer />
          <ChatWidget />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
