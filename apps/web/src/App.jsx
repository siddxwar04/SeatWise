import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ChatWidget } from './components/ChatWidget.jsx';
import { Footer } from './components/Footer.jsx';
import { Navbar } from './components/Navbar.jsx';
import { PageTransition } from './components/PageTransition.jsx';
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

function AppRoutes() {
  const location = useLocation();

  return (
    <PageTransition>
      <Routes location={location}>
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
    </PageTransition>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <a href="#main-content" className="skip_link">
            Skip to main content
          </a>

          <Navbar />

          <div id="main-content">
            <AppRoutes />
          </div>

          <Footer />
          <ChatWidget />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
