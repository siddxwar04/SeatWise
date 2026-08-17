import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SORTS } from '../data/cities.js';
import { CuratedLane } from '../components/discover/CuratedLane.jsx';
import { FilterBar } from '../components/discover/FilterBar.jsx';
import { MapPanel } from '../components/discover/MapPanel.jsx';
import { SearchRail } from '../components/discover/SearchRail.jsx';
import { VenueCard } from '../components/discover/VenueCard.jsx';
import { EmptyState, Skeleton } from '../components/ui/Data.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Segmented } from '../components/ui/Field.jsx';
import { useMarket } from '../context/MarketContext.jsx';
import { useAsync, useDebounced } from '../lib/hooks.js';
import { todayISO } from '../lib/format.js';
import { searchVenues } from '../services/marketplace.js';

/**
 * The diner homepage: search rail, filters, curated lane, results.
 *
 * Layout differences from the reference apps, each deliberate:
 *  - the rail is one pill with hairline dividers, not four scattered fields;
 *  - filters sit directly under it, not at the bottom of the page;
 *  - list and map are one split view with a shared hover, not two states you
 *    switch between — Resy forces you to narrow before it lets you see a map.
 */

const DEFAULT_QUERY = { text: '', date: todayISO(), time: '20:00', party: 2 };
const DEFAULT_FILTERS = { cuisines: [], areas: [], prices: [], quick: [] };

export function DiscoverPage() {
  const { city, citySlug, remember } = useMarket();
  const navigate = useNavigate();

  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('relevance');
  const [view, setView] = useState('split');
  const [hovered, setHovered] = useState(null);

  // Areas/quick filters are city-specific; switching city with stale filters
  // selected would silently zero the result set.
  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
  }, [citySlug]);

  const debouncedText = useDebounced(query.text, 200);

  const { data, status } = useAsync(
    () =>
      searchVenues({
        city: citySlug,
        text: debouncedText,
        areas: filters.areas,
        cuisines: filters.cuisines,
        prices: filters.prices,
        quick: filters.quick,
        party: query.party,
        time: query.time,
        sort,
      }),
    [citySlug, debouncedText, filters, query.party, query.time, sort],
  );

  const openVenue = (venue) => {
    remember(venue.slug);
    navigate(`/r/${venue.slug}`);
  };

  const loading = status === 'loading';
  const venues = data?.venues ?? [];

  const skeletons = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  return (
    <div className="discover">
      <header className="disc_hero">
        <div className="wrap disc_hero_inner">
          <span className="eyebrow">
            <Icon name="pin" /> {city.name}, {city.state}
          </span>
          <h1 className="disc_title display">
            Every table in {city.name},<br />
            <em>one search.</em>
          </h1>
          <p className="disc_sub">
            {loading ? 'Searching…' : `${data?.total ?? 0} restaurants · ${data?.bookableNow ?? 0} bookable right now`}
          </p>

          <SearchRail query={query} onChange={setQuery} />
          <FilterBar filters={filters} onChange={setFilters} />
        </div>
      </header>

      <div className="wrap">
        <CuratedLane venues={data?.curated ?? []} onOpen={openVenue} />

        <div className="disc_toolbar">
          <p className="disc_count">
            {loading ? (
              <Skeleton w={40} h={16} />
            ) : (
              <>
                <strong>{venues.length}</strong> restaurants
                <span className="dot" />
                {data?.bookableNow ?? 0} bookable now
              </>
            )}
          </p>

          <div className="disc_toolbar_right">
            <label className="disc_sort">
              <span className="sr-only">Sort by</span>
              <Icon name="sliders" />
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <Segmented
              label="Result layout"
              value={view}
              onChange={setView}
              size="sm"
              options={[
                { value: 'list', icon: 'list' },
                { value: 'split', icon: 'layers' },
                { value: 'map', icon: 'map' },
              ]}
            />
          </div>
        </div>

        <div className={`disc_body is-${view}`}>
          {view !== 'map' && (
            <div className="disc_results">
              {loading &&
                skeletons.map((i) => (
                  <div key={i} className="vcard is-skeleton">
                    <Skeleton w={100} h={160} radius="var(--r-lg)" />
                    <div className="vcard_body">
                      <Skeleton w={60} h={18} />
                      <Skeleton w={40} h={13} />
                      <Skeleton w={90} h={13} />
                    </div>
                  </div>
                ))}

              {!loading &&
                venues.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} onOpen={openVenue} onHoverPin={setHovered} />
                ))}

              {!loading && venues.length === 0 && (
                <EmptyState icon="search" title="Nothing matches all of those filters">
                  Loosen a filter, or widen the search — the results here respect party size and
                  timing honestly rather than showing venues you cannot actually book.
                </EmptyState>
              )}
            </div>
          )}

          {view !== 'list' && !loading && (
            <MapPanel venues={venues} city={city} hovered={hovered} onHoverPin={setHovered} onOpen={openVenue} />
          )}
        </div>
      </div>
    </div>
  );
}
