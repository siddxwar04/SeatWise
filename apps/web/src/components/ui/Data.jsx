import { cover } from '../../lib/cover.js';
import { compact, initials, percent } from '../../lib/format.js';
import { BAND_LABEL } from '../../lib/risk.js';
import { Icon } from './Icon.jsx';

/** Small status/label pill. `tone` maps onto the semantic colour tokens. */
export function Badge({ children, tone = 'neutral', icon, size = 'md' }) {
  return (
    <span className={`badge badge-${tone} badge-${size}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

const STATUS_TONE = {
  PENDING: 'warn',
  CONFIRMED: 'ok',
  SEATED: 'brand',
  COMPLETED: 'neutral',
  CANCELLED: 'muted',
  NO_SHOW: 'danger',
  WAITING: 'warn',
  AT_RISK: 'danger',
};

const STATUS_LABEL = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  SEATED: 'Seated',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
  WAITING: 'Waiting',
  AT_RISK: 'Waiting too long',
};

export function StatusBadge({ status, short = false }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'}>
      {short ? status.replace('_', ' ').toLowerCase() : (STATUS_LABEL[status] ?? status)}
    </Badge>
  );
}

/**
 * The no-show score, as staff see it.
 *
 * Colour *and* a number *and* a word: colour alone fails for colour-blind users
 * and prints as grey, and "high risk" without the percentage gives a host nothing
 * to weigh against the cost of the phone call.
 */
export function RiskBadge({ risk, showLabel = true }) {
  return (
    <span className={`risk risk-${risk.band}`} title={`${percent(risk.probability)} chance of no-show`}>
      <span className="risk_dot" aria-hidden="true" />
      <strong className="num">{percent(risk.probability)}</strong>
      {showLabel && <span className="risk_word">{BAND_LABEL[risk.band]}</span>}
    </span>
  );
}

/**
 * Demand meter.
 *
 * Real numbers from availability, not invented pressure: no "3 people are looking
 * at this right now". If the bar is at 82% it is because 82% of the covers are
 * sold.
 */
export function DemandMeter({ demand, remaining, compactMode = false }) {
  const level = demand >= 0.85 ? 'critical' : demand >= 0.6 ? 'high' : demand >= 0.35 ? 'medium' : 'low';
  const copy =
    remaining === 0
      ? `Fully committed · ${percent(demand)} booked`
      : remaining <= 2
        ? `${remaining} table${remaining === 1 ? '' : 's'} left · ${percent(demand)} booked`
        : `${percent(demand)} booked`;

  return (
    <div className={`meter meter-${level} ${compactMode ? 'is-compact' : ''}`}>
      <div
        className="meter_track"
        role="meter"
        aria-valuenow={Math.round(demand * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Covers booked"
      >
        <span className="meter_fill" style={{ width: `${Math.min(100, demand * 100)}%` }} />
      </div>
      {!compactMode && <span className="meter_copy">{copy}</span>}
    </div>
  );
}

export function StatTile({ label, value, hint, tone = 'neutral', icon, delta }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat_top">
        {icon && <Icon name={icon} className="stat_icon" />}
        <p className="stat_label">{label}</p>
      </div>
      <p className="stat_value num">{value}</p>
      {(hint || delta !== undefined) && (
        <p className="stat_hint">
          {delta !== undefined && (
            <span className={`stat_delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
              <Icon name={delta >= 0 ? 'trend-up' : 'trend-down'} />
              {Math.abs(Math.round(delta * 100))}%
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  );
}

export function StarRating({ rating, reviews, size = 'md' }) {
  return (
    <span className={`rating rating-${size}`} aria-label={`Rated ${rating} out of 5`}>
      <Icon name="star" className="rating_star" />
      <strong className="num">{rating.toFixed(1)}</strong>
      {reviews !== undefined && <span className="rating_count num">({compact(reviews)})</span>}
    </span>
  );
}

/**
 * Generated venue cover. No photography anywhere in this app — see lib/cover.js
 * for why, and for the determinism guarantee that keeps a venue looking the same
 * on every screen it appears on.
 */
export function Cover({ seed, name, size = 'md', badge }) {
  const { style, pattern } = cover(seed);

  return (
    <div className={`cover cover-${size}`} style={style} data-pattern={pattern} aria-hidden="true">
      <span className="cover_pattern" />
      <span className="cover_mono">{initials(name)}</span>
      {badge && <span className="cover_badge">{badge}</span>}
    </div>
  );
}

/** Loading placeholder. `w` is a percentage so lines look ragged, like text. */
export function Skeleton({ w = 100, h = 12, radius = 'var(--r-xs)', className = '' }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width: `${w}%`, height: h, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ icon = 'search', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty_icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/**
 * Horizontal bar for a distribution row (lead-time buckets, rating histogram).
 * `value` is 0–1; `scale` lets a set of bars share a maximum.
 */
export function Bar({ value, scale = 1, tone = 'brand', label, right }) {
  return (
    <div className="bar_row">
      {label && <span className="bar_label">{label}</span>}
      <span className="bar_track">
        <span
          className={`bar_fill bar-${tone}`}
          style={{ width: `${Math.min(100, (value / scale) * 100)}%` }}
        />
      </span>
      {right && <span className="bar_right num">{right}</span>}
    </div>
  );
}

/** Vertical column chart. Twelve data points do not justify a charting library. */
export function Columns({ data, format = (v) => v, tone = 'brand', height = 120 }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="cols" style={{ height }}>
      {data.map((d) => (
        <div className="col" key={d.label}>
          <span className="col_value num">{format(d.value)}</span>
          <span
            className={`col_fill col-${d.tone ?? tone}`}
            style={{ height: `${(d.value / max) * 100}%` }}
            title={`${d.label}: ${format(d.value)}`}
          />
          <span className="col_label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
