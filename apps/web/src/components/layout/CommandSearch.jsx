import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CITIES } from '../../data/cities.js';
import { VENUES } from '../../data/venues.js';
import { useMarket } from '../../context/MarketContext.jsx';
import { useDebounced } from '../../lib/hooks.js';
import { priceBand } from '../../lib/format.js';
import { Cover, StarRating } from '../ui/Data.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Sheet } from '../ui/Overlay.jsx';

/**
 * ⌘K search across the whole platform.
 *
 * A marketplace with 34 venues in six cities needs a way to jump straight to a
 * name you already know, without first picking the right city and then scrolling
 * a filtered list. Cities, cuisines and venues are all searchable from one field,
 * and it is fully keyboard-driven: ↑↓ to move, ⏎ to open, Esc to close.
 */

function score(venue, needle) {
  const name = venue.name.toLowerCase();
  if (name.startsWith(needle)) return 100;
  if (name.includes(needle)) return 70;
  if (venue.cuisine.toLowerCase().includes(needle)) return 45;
  if (venue.area.toLowerCase().includes(needle)) return 40;
  if ((venue.signatures ?? []).join(' ').toLowerCase().includes(needle)) return 20;
  return 0;
}

export function CommandSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const settled = useDebounced(query, 120);
  const navigate = useNavigate();
  const { setCitySlug, recent } = useMarket();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // The sheet moves focus to its panel for the announcement; hand it to the
      // input a beat later so typing works immediately.
      const timer = setTimeout(() => inputRef.current?.focus(), 90);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const results = useMemo(() => {
    const needle = settled.trim().toLowerCase();

    if (!needle) {
      // Empty state is a jump list: places you looked at recently, then cities.
      const recentVenues = recent.map((slug) => VENUES.find((v) => v.slug === slug)).filter(Boolean);
      return [
        ...(recentVenues.length
          ? [{ group: 'Recently viewed', items: recentVenues.map(toVenueItem) }]
          : []),
        { group: 'Cities', items: CITIES.map(toCityItem) },
      ];
    }

    const venues = VENUES.map((venue) => ({ venue, s: score(venue, needle) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || b.venue.rating - a.venue.rating)
      .slice(0, 7)
      .map((r) => toVenueItem(r.venue));

    const cities = CITIES.filter((c) => c.name.toLowerCase().includes(needle)).map(toCityItem);

    return [
      ...(venues.length ? [{ group: 'Restaurants', items: venues }] : []),
      ...(cities.length ? [{ group: 'Cities', items: cities }] : []),
    ];
  }, [settled, recent]);

  const flat = results.flatMap((section) => section.items);

  // Clamp the cursor whenever the result set shrinks under it.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const run = (item) => {
    if (!item) return;
    if (item.kind === 'city') {
      setCitySlug(item.slug);
      navigate('/');
    } else {
      navigate(`/r/${item.slug}`);
    }
    onClose();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % Math.max(1, flat.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % Math.max(1, flat.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(flat[cursor]);
    }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let index = -1;

  return (
    <Sheet open={open} onClose={onClose} title="Search SeatWise" size="lg">
      <div className="cmd">
        <div className="cmd_input">
          <Icon name="search" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Restaurant, cuisine, neighbourhood or city…"
            aria-label="Search restaurants and cities"
            autoComplete="off"
          />
          <kbd className="cmd_kbd">esc</kbd>
        </div>

        <div className="cmd_results" ref={listRef} role="listbox" aria-label="Search results">
          {flat.length === 0 && (
            <p className="cmd_none">
              Nothing matches “{query}”. Try a cuisine, or a neighbourhood like Bandra West.
            </p>
          )}

          {results.map((section) => (
            <div key={section.group} className="cmd_group">
              <p className="cmd_group_label">{section.group}</p>
              {section.items.map((item) => {
                index += 1;
                const active = index === cursor;
                return (
                  <button
                    key={`${item.kind}-${item.slug}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    className={`cmd_row ${active ? 'is-active' : ''}`}
                    onMouseEnter={() => setCursor(flat.indexOf(item))}
                    onClick={() => run(item)}
                  >
                    {item.kind === 'venue' ? (
                      <>
                        <Cover seed={item.slug} name={item.title} size="sm" />
                        <span className="cmd_text">
                          <strong>{item.title}</strong>
                          <span className="cmd_meta">{item.meta}</span>
                        </span>
                        <StarRating rating={item.rating} size="sm" />
                      </>
                    ) : (
                      <>
                        <span className="cmd_city_icon">
                          <Icon name="pin" />
                        </span>
                        <span className="cmd_text">
                          <strong>{item.title}</strong>
                          <span className="cmd_meta">{item.meta}</span>
                        </span>
                      </>
                    )}
                    <Icon name="arrow-right" className="cmd_go" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="cmd_foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>⏎</kbd> to open
          </span>
          <span>
            <kbd>⌘</kbd>
            <kbd>K</kbd> anywhere
          </span>
        </footer>
      </div>
    </Sheet>
  );
}

function toVenueItem(venue) {
  return {
    kind: 'venue',
    slug: venue.slug,
    title: venue.name,
    meta: `${venue.cuisine} · ${priceBand(venue.price)} · ${venue.area}`,
    rating: venue.rating,
  };
}

function toCityItem(city) {
  return {
    kind: 'city',
    slug: city.slug,
    title: city.name,
    meta: `${VENUES.filter((v) => v.city === city.slug).length} restaurants · ${city.state}`,
  };
}
