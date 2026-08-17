import { Link } from 'react-router-dom';
import { CITIES } from '../../data/cities.js';
import { MARKET_STATS, VENUES } from '../../data/venues.js';
import { useMarket } from '../../context/MarketContext.jsx';
import { LIVE_API } from '../../services/config.js';
import { compact } from '../../lib/format.js';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from './Logo.jsx';

/**
 * Footer.
 *
 * Doubles as the city index: six real links that switch the market, which is both
 * useful to a visitor and the honest way to show a marketplace's coverage.
 *
 * The demo-data notice is deliberate. A portfolio build that quietly presents
 * generated numbers as real data is misleading; saying so in one line costs
 * nothing and is the difference between a demo and a fake.
 */
export function Footer() {
  const { setCitySlug } = useMarket();
  const year = new Date().getFullYear();

  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot_top">
          <div className="foot_brand">
            <Logo />
            <p>
              Every table in the city, one search — and the risk tooling that keeps those tables
              from going empty.
            </p>
            <p className="foot_stats num">
              {MARKET_STATS.venues} restaurants · {MARKET_STATS.cities} cities ·{' '}
              {compact(MARKET_STATS.seats)} seats
            </p>
          </div>

          <div className="foot_col">
            <h3>Diners</h3>
            <ul>
              <li>
                <Link to="/">Discover restaurants</Link>
              </li>
              <li>
                <Link to="/bookings">My bookings</Link>
              </li>
              <li>
                <Link to="/login">Sign in</Link>
              </li>
              <li>
                <Link to="/register">Create an account</Link>
              </li>
            </ul>
          </div>

          <div className="foot_col">
            <h3>Restaurants</h3>
            <ul>
              <li>
                <Link to="/for-restaurants">Why SeatWise</Link>
              </li>
              <li>
                <Link to="/for-restaurants#calculator">No-show cost calculator</Link>
              </li>
              <li>
                <Link to="/console">Owner console</Link>
              </li>
              <li>
                <Link to="/for-restaurants#how">How the risk model works</Link>
              </li>
            </ul>
          </div>

          <div className="foot_col">
            <h3>Cities</h3>
            <ul>
              {CITIES.map((city) => (
                <li key={city.slug}>
                  <Link to="/" onClick={() => setCitySlug(city.slug)}>
                    {city.name}
                    <span className="foot_count num">
                      {VENUES.filter((v) => v.city === city.slug).length}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="foot_bottom">
          <p>© {year} SeatWise. A portfolio build, not a live business.</p>
          <p className="foot_mode">
            <Icon name="info" />
            {LIVE_API
              ? 'Connected to the SeatWise API.'
              : 'Running on generated demo data — restaurants, guests and reviews are invented.'}
          </p>
        </div>
      </div>
    </footer>
  );
}
