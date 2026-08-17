import { Link } from 'react-router-dom';

/**
 * SeatWise brand mark.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 * A table seen from above: a round top with four seats around it — and one seat
 * left hollow. That empty seat is the product. The whole company exists because
 * of the covers that get booked and never arrive, so the mark states the problem
 * rather than decorating around it. On hover the hollow seat fills, which is the
 * outcome the software is selling.
 *
 * ── Why it is built this way ─────────────────────────────────────────────────
 * Pure geometry on a 40×40 grid: one circle, four dots. No text inside the mark,
 * no gradients required to read it, nothing thinner than 3 units. That is what
 * makes it survive a 16px favicon *and* a 96px hero without a second asset —
 * which is the actual definition of a responsive logo, rather than exporting the
 * same PNG at three sizes.
 *
 * Geometry: seats sit on a 13-unit radius at the four cardinal points, r=3.4, so
 * the outer bound is 3.6…36.4 — even optical padding on all sides. The top is
 * r=7.5, leaving a deliberate 2.1-unit gap to each seat so the shapes stay
 * legible when they shrink.
 *
 * Colour comes from `currentColor` in `plain` mode so the mark inherits whatever
 * it sits on (footer, dark nav, print), and from a brand gradient in `tile` mode
 * for app-icon contexts.
 */

const SEATS = [
  { cx: 20, cy: 7 }, // north
  { cx: 33, cy: 20 }, // east
  { cx: 20, cy: 33 }, // south
  { cx: 7, cy: 20 }, // west — the no-show
];

export function LogoMark({ variant = 'plain', size = 28, className = '' }) {
  const tile = variant === 'tile';
  const gradientId = `sw-grad-${variant}`;

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={`mark ${tile ? 'is-tile' : ''} ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      {tile && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--violet-500)" />
              <stop offset="1" stopColor="var(--violet-700)" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="10" fill={`url(#${gradientId})`} />
        </>
      )}

      <g className="mark_glyph">
        {/* The table top. */}
        <circle cx="20" cy="20" r="7.5" className="mark_table" />

        {/* Three seats taken… */}
        {SEATS.slice(0, 3).map((seat) => (
          <circle key={`${seat.cx}-${seat.cy}`} {...seat} r="3.4" className="mark_seat" />
        ))}

        {/* …and one that never showed up. */}
        <circle {...SEATS[3]} r="3.4" className="mark_seat is-empty" strokeWidth="2.2" fill="none" />
      </g>
    </svg>
  );
}

/**
 * Full lockup: mark + wordmark.
 *
 * The wordmark is real text, not a path — so it is selectable, translatable,
 * searchable, and it renders in the user's own font stack if the webfont fails.
 * The two halves are weighted differently ("Seat" solid, "Wise" brand) so the
 * compound name reads as one word with an emphasis rather than two.
 */
export function Logo({ to = '/', showWord = true, variant = 'tile', size = 28 }) {
  return (
    <Link to={to} className="logo" aria-label="SeatWise — home">
      <LogoMark variant={variant} size={size} />
      {showWord && (
        <span className="logo_word">
          Seat<span>Wise</span>
        </span>
      )}
    </Link>
  );
}
