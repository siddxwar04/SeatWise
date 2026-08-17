import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CITIES } from '../../data/cities.js';
import { VENUES } from '../../data/venues.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useMarket } from '../../context/MarketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useHotkey, useScrollLock } from '../../lib/hooks.js';
import { Button, IconButton } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Dropdown, PopItem } from '../ui/Overlay.jsx';
import { CommandSearch } from './CommandSearch.jsx';
import { Logo } from './Logo.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

/**
 * Top bar.
 *
 * Three things it has to do that the old nav did not:
 *
 *  1. Work below 992px. The previous navbar rendered a hamburger that no
 *     JavaScript was attached to, so on a phone the site had no navigation at all
 *     — including no route to sign in.
 *  2. Carry the city. In a multi-city marketplace the city is a global filter, so
 *     it belongs in the chrome, not buried in a page.
 *  3. Show the console only to accounts that can use it, without pretending that
 *     is security. Every protected route is enforced server-side too.
 */
export function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const { user, isAuthenticated, canAccessConsole, logout } = useAuth();
  const { city, setCitySlug } = useMarket();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  useScrollLock(drawerOpen);
  useHotkey('k', () => setSearchOpen(true), { meta: true });
  useHotkey('/', () => setSearchOpen(true));

  // Close the drawer on navigation, or it hangs over the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    toast.success('Signed out.');
    navigate('/');
  }, [logout, navigate, toast]);

  const links = [
    { to: '/', label: 'Discover', end: true },
    { to: '/bookings', label: 'My bookings', authOnly: true },
    { to: '/for-restaurants', label: 'For restaurants' },
    { to: '/console', label: 'Console', consoleOnly: true },
  ].filter((link) => {
    if (link.authOnly && !isAuthenticated) return false;
    if (link.consoleOnly && !canAccessConsole) return false;
    return true;
  });

  return (
    <>
      <header className={`nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="nav_inner wrap">
          <div className="nav_left">
            <Logo />

            {/* City switcher. Hidden on the narrowest screens, where it moves
                into the drawer — two competing selects in a 360px bar is worse
                than one extra tap. */}
            <Dropdown
              label="Choose city"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className={`city_btn ${open ? 'is-open' : ''}`}
                  onClick={toggle}
                  aria-expanded={open}
                >
                  <Icon name="pin" />
                  <span>{city.name}</span>
                  <Icon name="chevron-down" className="city_caret" />
                </button>
              )}
            >
              {({ close }) =>
                CITIES.map((option) => (
                  <PopItem
                    key={option.slug}
                    selected={option.slug === city.slug}
                    hint={`${VENUES.filter((v) => v.city === option.slug).length}`}
                    onClick={() => {
                      setCitySlug(option.slug);
                      close();
                      if (location.pathname !== '/') navigate('/');
                    }}
                  >
                    {option.name}
                  </PopItem>
                ))
              }
            </Dropdown>
          </div>

          <nav className="nav_links" aria-label="Main">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav_link ${isActive ? 'is-active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="nav_right">
            <button type="button" className="nav_search" onClick={() => setSearchOpen(true)}>
              <Icon name="search" />
              <span>Search</span>
              <kbd>⌘K</kbd>
            </button>

            <ThemeToggle />

            {isAuthenticated ? (
              <Dropdown
                align="end"
                label="Account"
                trigger={({ toggle, open }) => (
                  <button
                    type="button"
                    className={`avatar_btn ${open ? 'is-open' : ''}`}
                    onClick={toggle}
                    aria-expanded={open}
                    aria-label="Account menu"
                  >
                    <span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span>
                  </button>
                )}
              >
                {({ close }) => (
                  <>
                    <div className="pop_head">
                      <strong>{user.username}</strong>
                      <span>{user.email}</span>
                    </div>
                    <PopItem icon="calendar-check" onClick={() => { close(); navigate('/bookings'); }}>
                      My bookings
                    </PopItem>
                    {canAccessConsole && (
                      <PopItem icon="gauge" onClick={() => { close(); navigate('/console'); }}>
                        Restaurant console
                      </PopItem>
                    )}
                    <PopItem icon="logout" onClick={() => { close(); handleLogout(); }}>
                      Sign out
                    </PopItem>
                  </>
                )}
              </Dropdown>
            ) : (
              <div className="nav_auth">
                <Button variant="ghost" size="sm" to="/login">
                  Sign in
                </Button>
                <Button variant="primary" size="sm" to="/register">
                  Join free
                </Button>
              </div>
            )}

            <IconButton
              icon={drawerOpen ? 'x' : 'menu'}
              label={drawerOpen ? 'Close menu' : 'Open menu'}
              className="nav_burger"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((v) => !v)}
            />
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────── mobile drawer */}
      <div className={`drawer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <button
          type="button"
          className="drawer_scrim"
          aria-label="Close menu"
          tabIndex={drawerOpen ? 0 : -1}
          onClick={() => setDrawerOpen(false)}
        />

        <div className="drawer_panel">
          <div className="drawer_head">
            <Logo />
            <IconButton icon="x" label="Close menu" onClick={() => setDrawerOpen(false)} />
          </div>

          <button
            type="button"
            className="drawer_search"
            onClick={() => {
              setDrawerOpen(false);
              setSearchOpen(true);
            }}
          >
            <Icon name="search" />
            Search restaurants
          </button>

          <p className="drawer_label">City</p>
          <div className="drawer_cities">
            {CITIES.map((option) => (
              <button
                key={option.slug}
                type="button"
                className={`drawer_city ${option.slug === city.slug ? 'is-on' : ''}`}
                onClick={() => {
                  setCitySlug(option.slug);
                  setDrawerOpen(false);
                  if (location.pathname !== '/') navigate('/');
                }}
              >
                {option.name}
              </button>
            ))}
          </div>

          <p className="drawer_label">Menu</p>
          <nav className="drawer_links" aria-label="Mobile">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `drawer_link ${isActive ? 'is-active' : ''}`}
              >
                {link.label}
                <Icon name="chevron-right" />
              </NavLink>
            ))}
          </nav>

          <div className="drawer_foot">
            {isAuthenticated ? (
              <>
                <div className="drawer_user">
                  <span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{user.username}</strong>
                    <span>{user.email}</span>
                  </span>
                </div>
                <Button variant="secondary" block icon="logout" onClick={handleLogout}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" block to="/register">
                  Join free
                </Button>
                <Button variant="secondary" block to="/login">
                  Sign in
                </Button>
              </>
            )}
            <Link to="/for-restaurants" className="drawer_owner">
              <Icon name="store" />
              Run a restaurant? See the owner tools
            </Link>
          </div>
        </div>
      </div>

      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
