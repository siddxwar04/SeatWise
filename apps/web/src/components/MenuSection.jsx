import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_RESTAURANT_SLUG, menuApi } from '../lib/api.js';
import { resolveVenueSlug } from '../lib/venue.js';
import { Stagger, StaggerItem } from './Reveal.jsx';

/**
 * The menu, from the database.
 *
 * Two audit findings close here:
 *
 *  #35 — twelve near-identical nine-line HTML blocks (index.html:91-182).
 *        Changing a price meant editing markup and redeploying.
 *  #14 — four .tab_btn buttons, one hard-coded `active`, and no JavaScript
 *        anywhere to filter. They looked interactive and did nothing. They
 *        could not have worked: there was no data layer to filter against.
 *
 * The tab labels and the rendered card markup are unchanged, so the section
 * looks exactly as it did. Overlay details open on hover (desktop), tap
 * (touch), or keyboard focus — hover-only was unusable on phones.
 */

const TABS = [
  { label: 'All', value: null },
  { label: 'Breakfast', value: 'BREAKFAST' },
  { label: 'Lunch', value: 'LUNCH' },
  { label: 'Dessert', value: 'DESSERT' },
];

export function MenuSection() {
  const { search } = useLocation();
  const restaurantSlug = resolveVenueSlug(search, DEFAULT_RESTAURANT_SLUG);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [status, setStatus] = useState('loading');
  const [openCardId, setOpenCardId] = useState(null);

  // Fetch the full menu once and filter in memory. Twelve items do not justify
  // a network round trip per tab click, and it keeps switching instant.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    menuApi
      .list(restaurantSlug)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug]);

  const visible = useMemo(
    () => (activeTab ? items.filter((item) => item.category === activeTab) : items),
    [items, activeTab],
  );

  const toggleCard = (id) => {
    setOpenCardId((current) => (current === id ? null : id));
  };

  return (
    <section className="container menu_section" id="menu">
      <span className="tag">Full Menu</span>
      <h2>Curated for You</h2>
      <p>Authentic flavors from around the world, all in one place.</p>

      {/* role=tablist so the filter is announced as a filter, not as four
          unrelated buttons. */}
      <div className="menu_tabs" role="tablist" aria-label="Filter menu by course">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={activeTab === tab.value ? 'tab_btn active' : 'tab_btn'}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="skeleton_grid" aria-busy="true" aria-label="Loading the menu">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton_card" key={i} />
          ))}
        </div>
      )}
      {status === 'error' && (
        <p className="menu_state menu_state_error">
          We could not load the menu just now. Please refresh the page.
        </p>
      )}

      {status === 'ready' && visible.length === 0 && (
        <p className="menu_state">Nothing on the menu in this course today.</p>
      )}

      <Stagger className="menu_grid" stagger={0.05}>
        {visible.map((item) => {
          const isOpen = openCardId === item.id;
          return (
            <StaggerItem key={item.id}>
              <article
                className={isOpen ? 'menu_card is-open' : 'menu_card'}
                tabIndex={0}
                role="button"
                aria-expanded={isOpen}
                aria-label={`${item.name}, ${item.priceLabel}. ${isOpen ? 'Hide' : 'Show'} details`}
                onClick={() => toggleCard(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCard(item.id);
                  }
                }}
              >
                <img
                  src={item.imageUrl}
                  alt={item.imageAlt}
                  loading="lazy"
                  decoding="async"
                  width="400"
                  height="300"
                />
                <div className="card_info">
                  <h3>{item.name}</h3>
                  <span>{item.priceLabel}</span>
                </div>
                <div className="card_overlay" aria-hidden={!isOpen}>
                  <p>{item.description}</p>
                  {item.allergens.length > 0 && (
                    <p className="card_allergens">
                      Contains:{' '}
                      {item.allergens.map((a) => a.replace('_', ' ').toLowerCase()).join(', ')}
                    </p>
                  )}
                </div>
              </article>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}
