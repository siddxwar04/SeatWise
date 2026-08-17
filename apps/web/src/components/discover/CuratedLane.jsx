import { Cover } from '../ui/Data.jsx';
import { priceBand } from '../../lib/format.js';

/**
 * Editorial picks as a horizontal lane, not the whole homepage.
 *
 * Resy's curation is its strongest asset but it displaces search — the whole
 * front page can be an editor's opinion before you ever get to type anything.
 * Here it is one scannable row that never competes with the results grid
 * beneath it.
 */
export function CuratedLane({ venues, onOpen }) {
  if (!venues.length) return null;

  return (
    <section className="lane_wrap" aria-label="Curated picks">
      <div className="lane_head">
        <h2>Curated for tonight</h2>
        <span className="lane_hint">Editorial picks — never displaces your search results</span>
      </div>
      <div className="lane scroller">
        {venues.map((venue) => (
          <button key={venue.id} type="button" className="lane_card" onClick={() => onOpen(venue)}>
            <Cover seed={venue.slug} name={venue.name} size="md" />
            <span className="lane_tag">{venue.curated}</span>
            <strong>{venue.name}</strong>
            <span className="lane_meta">
              {venue.cuisine} · {priceBand(venue.price)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
