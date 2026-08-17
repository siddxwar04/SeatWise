import { formatTime } from '../../lib/format.js';
import { seedHue } from '../../lib/cover.js';

/**
 * Schematic map, not a real one.
 *
 * A live map tile provider is a network dependency this build should not
 * take on for a portfolio demo, and an embedded Google/Mapbox map with fake
 * pins would be more dishonest than a stated schematic. Each city carries its
 * own river/road paths (data/cities.js) so the backdrop is not one generic
 * grid reused for six different cities.
 */
export function MapPanel({ venues, city, hovered, onHoverPin, onOpen }) {
  return (
    <aside className="mappanel" aria-label={`Schematic map of ${city.name}`}>
      <svg className="mappanel_bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={city.map.river} className="mappanel_river" />
        {city.map.roads.map((d, i) => (
          <path key={i} d={d} className="mappanel_road" />
        ))}
      </svg>

      {venues.map((venue) => {
        const active = hovered === venue.id;
        const hue = seedHue(venue.slug);
        return (
          <button
            key={venue.id}
            type="button"
            className={`mappin ${active ? 'is-active' : ''} ${venue.remaining === 0 ? 'is-full' : ''}`}
            style={{ left: `${venue.map.x}%`, top: `${venue.map.y}%`, '--pin-h': hue }}
            onMouseEnter={() => onHoverPin(venue.id)}
            onMouseLeave={() => onHoverPin(null)}
            onClick={() => onOpen(venue)}
          >
            <span className="mappin_label">
              {venue.remaining === 0 ? 'Full' : venue.bestSlot ? formatTime(venue.bestSlot.time) : '—'}
            </span>
            {active && <span className="mappin_card">{venue.name}</span>}
          </button>
        );
      })}

      <p className="mappanel_note">Schematic layout for illustration — not to scale.</p>
    </aside>
  );
}
