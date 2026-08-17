import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { RiskBadge, StatTile } from '../components/ui/Data.jsx';
import { MARKET_STATS } from '../data/venues.js';
import { compact, inr, percent } from '../lib/format.js';
import { SCENARIOS, WEIGHTS, noShowRisk } from '../lib/risk.js';

const PITCH = [
  {
    icon: 'shield',
    title: 'Score every booking',
    body: 'A logistic model ranks the book by no-show probability — lead time, party, history, confirmation — so the host knows who to call, not who looks nervous.',
  },
  {
    icon: 'trend-up',
    title: 'Overbook from the distribution',
    body: 'Extra covers come from the Poisson-binomial of those scores, not floor(Σp). The number you sell is the largest extra that keeps walk-away risk under 5%.',
  },
  {
    icon: 'seat',
    title: 'Seat the waitlist tightly',
    body: 'When a no-show frees a table, assignment packs waiting parties into the smallest fit — not the first empty four-top a host happens to see.',
  },
];

const FEATURES = [
  { label: 'Lead time', why: 'Plans decay. Log days, not a linear clock.' },
  { label: 'Party size', why: 'Bigger tables show more — the social cost of bailing is higher.' },
  { label: 'Confirmation', why: 'An answered text is the strongest protective signal.' },
  { label: 'Guest history', why: 'Prior no-shows dominate; clean visits help, then saturate.' },
  { label: 'First-time guest', why: 'No history is riskier than a thin good one.' },
  { label: 'Weekend / prime time', why: 'More competing plans, exactly where an empty seat costs most.' },
  { label: 'Prepaid / deposit', why: 'Money down changes behaviour more than any reminder.' },
];

/**
 * Owner marketing page. The footer already points here for “Why SeatWise”,
 * the no-show calculator, and the model explainer — this file is that surface.
 */
export function ForRestaurantsPage() {
  const location = useLocation();
  const [covers, setCovers] = useState(40);
  const [check, setCheck] = useState(3700);
  const [rate, setRate] = useState(15);
  const [nights, setNights] = useState(6);

  useEffect(() => {
    const id = location.hash.replace('#', '');
    if (!id) return;
    document.getElementById(id)?.scrollIntoView();
  }, [location.hash]);

  const nightly = Math.max(0, covers) * (Math.max(0, rate) / 100) * Math.max(0, check);
  const weekly = nightly * Math.max(0, nights);
  const yearly = weekly * 52;

  const scenarios = useMemo(
    () => SCENARIOS.map((s) => ({ ...s, risk: noShowRisk(s.features) })),
    [],
  );

  return (
    <div className="mkt">
      <header className="mkt_hero">
        <div className="wrap">
          <span className="eyebrow">
            <Icon name="store" /> For restaurants
          </span>
          <h1 className="mkt_title">
            Empty seats are a <em>scored</em> problem, not a staffing one.
          </h1>
          <p className="mkt_sub">
            SeatWise is the diner marketplace plus the yield layer OpenTable does not give you:
            per-booking no-show risk, expected-value overbooking, and waitlist assignment that
            actually packs the floor.
          </p>
          <div className="row row-wrap" style={{ gap: 'var(--s-3)' }}>
            <Button variant="primary" size="lg" to="/console" icon="chart">
              Open the owner console
            </Button>
            <Button variant="ghost" size="lg" href="#calculator">
              Cost the damage
            </Button>
          </div>
          <p className="mkt_stats num">
            {MARKET_STATS.venues} restaurants · {MARKET_STATS.cities} cities ·{' '}
            {compact(MARKET_STATS.seats)} seats on the demo market
          </p>
        </div>
      </header>

      <section className="wrap mkt_section">
        <div className="mkt_grid">
          {PITCH.map((item) => (
            <article key={item.title} className="mkt_card">
              <span className="mkt_icon">
                <Icon name={item.icon} />
              </span>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="calculator" className="wrap mkt_section">
        <header className="section-head">
          <div>
            <span className="eyebrow">The arithmetic</span>
            <h2>No-show cost calculator</h2>
            <p>
              A 10–20% no-show rate on a ~₹3,700 check is hundreds of rupees a cover, against 3–5%
              net margins. Change the numbers for your room.
            </p>
          </div>
        </header>

        <div className="mkt_calc">
          <form className="mkt_calc_form" onSubmit={(e) => e.preventDefault()}>
            <TextField
              label="Covers per night"
              type="number"
              min="1"
              value={covers}
              onChange={(e) => setCovers(Number(e.target.value))}
            />
            <TextField
              label="Average check (₹)"
              type="number"
              min="0"
              value={check}
              onChange={(e) => setCheck(Number(e.target.value))}
            />
            <TextField
              label="No-show rate (%)"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
            <TextField
              label="Service nights / week"
              type="number"
              min="1"
              max="7"
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
            />
          </form>

          <div className="stat_grid">
            <StatTile
              label="Expected empty covers"
              value={(covers * (rate / 100)).toFixed(1)}
              icon="users"
            />
            <StatTile label="Lost tonight" value={inr(nightly)} tone="danger" icon="alert" />
            <StatTile label="Lost this week" value={inr(weekly)} icon="calendar" />
            <StatTile label="Lost this year" value={inr(yearly)} tone="warn" icon="trend-down" />
          </div>
        </div>
      </section>

      <section id="how" className="wrap mkt_section">
        <header className="section-head">
          <div>
            <span className="eyebrow">The model</span>
            <h2>How the risk score is built</h2>
            <p>
              Same functional form as a trained logistic regression —{' '}
              <span className="num">P(no-show) = sigmoid(bias + w · x)</span> — with published
              coefficients so a host can see <em>why</em> a booking is 70% and not just that it is.
              Swapping fitted weights later changes constants, not the UI.
            </p>
          </div>
        </header>

        <div className="mkt_scenarios">
          {scenarios.map((s) => (
            <article key={s.id} className="mkt_card">
              <div className="spread">
                <h3>{s.title}</h3>
                <RiskBadge risk={s.risk} />
              </div>
              <p>{s.summary}</p>
              <ul className="mkt_drivers">
                {s.risk.drivers.slice(0, 4).map((d) => (
                  <li key={d.label}>
                    <span>{d.label}</span>
                    <span className={`num ${d.direction > 0 ? 'is-up' : 'is-down'}`}>
                      {d.direction > 0 ? '+' : '−'}
                      {Math.abs(d.effect).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mkt_bias cell_sub">
          Bias (log-odds of a blank booking): {WEIGHTS.bias}. Scores are clamped so nothing reads as
          certain to show or hopeless.
        </p>

        <ul className="mkt_features">
          {FEATURES.map((f) => (
            <li key={f.label}>
              <strong>{f.label}</strong>
              <span>{f.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="wrap mkt_section mkt_cta">
        <div className="mkt_card mkt_card-wide">
          <h2>See it on a live book</h2>
          <p>
            The owner console runs these three algorithms against tonight’s generated reservations.
            Sign in with the restaurant demo account to open it.
          </p>
          <div className="row row-wrap">
            <Button variant="primary" to="/login" iconEnd="arrow-right">
              Sign in as owner
            </Button>
            <Button variant="ghost" to="/console">
              Skip to console
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
