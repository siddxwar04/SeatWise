import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_RESTAURANT_SLUG, menuApi } from '../lib/api.js';

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
 * looks exactly as it did.
 */

const TABS = [
  { label: 'All', value: null },
  { label: 'Breakfast', value: 'BREAKFAST' },
  { label: 'Lunch', value: 'LUNCH' },
  { label: 'Dessert', value: 'DESSERT' },
];

export function MenuSection() {
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [status, setStatus] = useState('loading');

  // Fetch the full menu once and filter in memory. Twelve items do not justify
  // a network round trip per tab click, and it keeps switching instant.
  useEffect(() => {
    let cancelled = false;

    menuApi
      .list(DEFAULT_RESTAURANT_SLUG)
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
  }, []);

  const visible = useMemo(
    () => (activeTab ? items.filter((item) => item.category === activeTab) : items),
    [items, activeTab],
  );

  return (
    <section className="container menu_section" id="menu">
      <span className="tag" style={{ background: '#fff0db', color: '#ff914d' }}>
        Full Menu
      </span>
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

      {status === 'loading' && <p className="menu_state">Loading the menu…</p>}
      {status === 'error' && (
        <p className="menu_state menu_state_error">
          We could not load the menu just now. Please refresh the page.
        </p>
      )}

      {status === 'ready' && visible.length === 0 && (
        <p className="menu_state">Nothing on the menu in this course today.</p>
      )}

      <div className="menu_grid">
        {visible.map((item) => (
          <article className="menu_card" key={item.id}>
            {/* Below the fold, so lazy. Explicit dimensions reserve the box and
                stop the grid reflowing as images arrive. */}
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
            {/* .card_overlay was fully styled in style.css:442-460 and used by
                no HTML at all — dead CSS for a feature nobody built. The
                description column now gives it something real to show. */}
            <div className="card_overlay">
              <p>{item.description}</p>
              {item.allergens.length > 0 && (
                <p className="card_allergens">
                  Contains:{' '}
                  {item.allergens.map((a) => a.replace('_', ' ').toLowerCase()).join(', ')}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
