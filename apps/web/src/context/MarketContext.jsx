import { createContext, useCallback, useContext, useMemo } from 'react';
import { DEFAULT_CITY, getCity } from '../data/cities.js';
import { useStoredState } from '../lib/hooks.js';

/**
 * The city the visitor is shopping in.
 *
 * It lives above the router because two unrelated places need it: the navbar's
 * switcher and the discover page's query. Threading it through props would mean
 * the shell owning search state it has no business knowing about.
 *
 * Persisted, because a marketplace that forgets which city you are in on every
 * reload is unusable.
 */

const MarketContext = createContext(null);

export function MarketProvider({ children }) {
  const [citySlug, setCitySlug] = useStoredState('seatwise.city', DEFAULT_CITY);
  const [recent, setRecent] = useStoredState('seatwise.recent', []);

  /** Most-recent-first, capped, no duplicates — a jump list, not a log. */
  const remember = useCallback(
    (slug) => setRecent((list) => [slug, ...list.filter((s) => s !== slug)].slice(0, 6)),
    [setRecent],
  );

  const value = useMemo(
    () => ({ citySlug, city: getCity(citySlug), setCitySlug, recent, remember }),
    [citySlug, setCitySlug, recent, remember],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useMarket must be used inside <MarketProvider>');
  return context;
}
