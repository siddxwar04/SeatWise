import { CUISINES, PRICE_BANDS, QUICK_FILTERS } from '../../data/cities.js';
import { useMarket } from '../../context/MarketContext.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Dropdown, PopItem } from '../ui/Overlay.jsx';

/**
 * Cuisine / area / price / quick filters, sitting directly under the search
 * rail. On the incumbents these are at the bottom of the homepage, past the
 * footer fold — first-time visitors never scroll that far. Promoting them
 * above the results is a specific, checkable difference from the reference
 * apps studied for this build.
 */

function MultiFilter({ label, icon, items, selected, onToggle, render }) {
  const count = selected.length;

  return (
    <Dropdown
      label={label}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`chip ${count ? 'is-on' : ''} ${open ? 'is-open' : ''}`}
          onClick={toggle}
          aria-expanded={open}
        >
          <Icon name={icon} />
          {label}
          {count > 0 && <span className="chip_count">{count}</span>}
          <Icon name="chevron-down" className="chip_caret" />
        </button>
      )}
    >
      {items.map((item) => {
        const key = render ? item.value : item;
        const text = render ? render(item) : item;
        return (
          <PopItem key={key} selected={selected.includes(key)} onClick={() => onToggle(key)}>
            {text}
          </PopItem>
        );
      })}
    </Dropdown>
  );
}

export function FilterBar({ filters, onChange }) {
  const { city } = useMarket();

  const toggle = (key) => (value) =>
    onChange({
      ...filters,
      [key]: filters[key].includes(value)
        ? filters[key].filter((v) => v !== value)
        : [...filters[key], value],
    });

  const activeCount = filters.cuisines.length + filters.areas.length + filters.prices.length + filters.quick.length;

  return (
    <div className="filterbar scroller">
      <MultiFilter
        label="Cuisine"
        icon="utensils"
        items={CUISINES}
        selected={filters.cuisines}
        onToggle={toggle('cuisines')}
      />
      <MultiFilter
        label="Area"
        icon="pin"
        items={city.areas}
        selected={filters.areas}
        onToggle={toggle('areas')}
      />
      <MultiFilter
        label="Price"
        icon="card"
        items={PRICE_BANDS}
        selected={filters.prices}
        onToggle={toggle('prices')}
        render={(p) => `${p.label} · ${p.hint}`}
      />

      <span className="filterbar_div" />

      {QUICK_FILTERS.map((f) => {
        const on = filters.quick.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            className={`chip is-quick ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle('quick')(f.id)}
          >
            <Icon name={f.icon} />
            {f.label}
          </button>
        );
      })}

      {activeCount > 0 && (
        <button
          type="button"
          className="chip_clear"
          onClick={() => onChange({ cuisines: [], areas: [], prices: [], quick: [] })}
        >
          Clear {activeCount}
        </button>
      )}
    </div>
  );
}
