import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { MARKET_STATS } from '../data/venues.js';
import { compact } from '../lib/format.js';

/**
 * City-neutral splash shown once before the diner drops into a specific
 * city's discover page. Deliberately not wired to MarketContext or search —
 * its only job is the handoff, via `onContinue`, into the experience that
 * already exists.
 */
export function LandingPage({ onContinue }) {
  return (
    <div className="landing">
      <section className="landing_hero">
        <div className="wrap landing_grid">
          <div className="landing_copy">
            <span className="eyebrow">
              <Icon name="sparkles" /> SeatWise
            </span>

            <h1 className="landing_title display">
              Every table.
              <br />
              <em>one search.</em>
            </h1>

            <p className="landing_sub">
              One place to find, filter, and book a table — across every city SeatWise
              covers. Pick your city next and the rest works exactly the way it always
              has.
            </p>

            <div className="row row-wrap landing_cta">
              <Button variant="primary" size="lg" iconEnd="arrow-right" onClick={onContinue}>
                Find a table
              </Button>
            </div>

            <p className="landing_stats num">
              {MARKET_STATS.venues}+ restaurants · {MARKET_STATS.cities} cities ·{' '}
              {compact(MARKET_STATS.monthlyBookings)} bookings a month
            </p>
          </div>

          <div className="landing_visual" aria-hidden="true">
            <div className="landing_glow" />

            <svg
              className="landing_art"
              viewBox="0 0 320 320"
              width="320"
              height="320"
              fill="none"
            >
              <circle cx="160" cy="160" r="118" className="landing_art_plate" />
              <circle cx="160" cy="160" r="92" className="landing_art_rim" />
              <g className="landing_art_garnish">
                <circle cx="160" cy="160" r="26" />
                <path d="M160 134v52M134 160h52M141 141l38 38M179 141l-38 38" />
              </g>
              <g className="landing_art_fork">
                <path d="M70 96v128" />
                <path d="M60 96v26M70 96v26M80 96v26" />
              </g>
              <g className="landing_art_knife">
                <path d="M250 96v128" />
                <path d="M250 96c10 0 16 10 16 22s-6 20-16 22" />
              </g>
            </svg>

            <div className="landing_badge landing_badge-a">
              <Icon name="pin" /> {MARKET_STATS.cities} cities
            </div>
            <div className="landing_badge landing_badge-b">
              <Icon name="utensils" /> {MARKET_STATS.venues}+ restaurants
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
