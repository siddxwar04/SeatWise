import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useStoredState } from '../lib/hooks.js';

/**
 * Theme: `light` | `dark` | `system`.
 *
 * Three states, not two. A binary toggle silently overrides the OS preference
 * the first time it is touched and there is then no way back to "follow my
 * system", which is the setting most people actually want.
 *
 * The resolved value is written to `data-theme` on <html>; tokens.css keys off
 * it. index.html runs the same resolution inline before first paint, so a dark-
 * mode visitor never sees a white flash.
 */

const ThemeContext = createContext(null);
const STORAGE_KEY = 'seatwise.theme';

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useStoredState(STORAGE_KEY, 'system');

  const resolved = useMemo(
    () => (preference === 'system' ? systemTheme() : preference),
    // systemTheme() is read at render time; the listener below forces a re-read
    // when the OS flips, so this does not need the media query as a dependency.
    [preference],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  // Follow the OS while the preference is `system`.
  useEffect(() => {
    if (preference !== 'system') return undefined;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = mql.matches ? 'dark' : 'light';
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [preference]);

  /** Cycles light → dark → system, which keeps one control for three states. */
  const cycle = useCallback(() => {
    setPreference((current) =>
      current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light',
    );
  }, [setPreference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, cycle }),
    [preference, resolved, setPreference, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
