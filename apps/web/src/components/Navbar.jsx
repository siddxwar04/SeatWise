import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Same markup and class names as the original nav. Two things that were broken
 * now work:
 *
 *  1. THE HAMBURGER (audit #12). style.css:764 already defined `.nav_links.active`
 *     to slide the menu open, and `.mobile_menu_icon` already rendered at 992px
 *     — but no JavaScript ever added the class. Below 992px the site had no
 *     navigation at all, and no way to reach Log In or Sign Up. The README
 *     listed it as a completed feature. It is roughly five lines of state.
 *
 *  2. AUTH-AWARE LINKS (audit #11). Login set $_SESSION and then redirected to
 *     a static .html file that PHP never processed, so nothing could ever read
 *     it. The navbar always said "Log In / Sign Up" even when signed in.
 */
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const navRef = useRef(null);

  // Close the menu on navigation, or the panel stays open over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  // Escape closes it, and a click outside dismisses it — both are what people
  // reflexively try, and neither existed.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onPointerDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setMenuOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out. See you soon.');
    navigate('/');
  };

  /** On the home page these are in-page anchors; elsewhere they route home. */
  const sectionLink = (hash, label) =>
    location.pathname === '/' ? (
      <a href={`#${hash}`}>{label}</a>
    ) : (
      <Link to={`/#${hash}`}>{label}</Link>
    );

  return (
    <nav ref={navRef}>
      <div className="container navigation">
        <Link to="/" className="logo_container">
          <div className="logo_icon_circle">
            <img src="/images/logo1.webp" alt="TastyFood Logo" width="50" height="50" />
          </div>
          <div className="brand_text">
            Tasty<span>Food.</span>
          </div>
        </Link>

        <ul className={menuOpen ? 'nav_links active' : 'nav_links'} id="primary-navigation">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>{sectionLink('menu', 'Menu')}</li>
          <li>{sectionLink('reserve', 'Reservations')}</li>
          <li>{sectionLink('contact', 'Contact')}</li>
          {isAuthenticated && (
            <li>
              <Link to="/my-reservations">My Bookings</Link>
            </li>
          )}
          {isAdmin && (
            <li>
              <Link to="/admin">Admin</Link>
            </li>
          )}
        </ul>

        <div className="auth_buttons">
          {isAuthenticated ? (
            <>
              <span className="nav_greeting">Hi, {user.username.split(' ')[0]}</span>
              <button type="button" className="btn btn-login" onClick={handleLogout}>
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-login">
                Log In
              </Link>
              <Link to="/register" className="btn btn-primary">
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Was a bare <div> with an icon: not focusable, not announced, no
            state. Now a real button with the ARIA a screen reader needs. */}
        <button
          type="button"
          className="mobile_menu_icon"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <i className={menuOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars'} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
