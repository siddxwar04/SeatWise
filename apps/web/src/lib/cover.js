/**
 * Generated venue covers.
 *
 * There are no photographs anywhere in this app, which is a deliberate call: a
 * marketplace demo with placeholder food photography looks like a stock-image
 * template, and real venue photography is not something a portfolio build can
 * source honestly. Instead every venue gets a cover derived from its own slug —
 * a two-stop gradient plus one of four geometric patterns plus its monogram.
 *
 * Two properties make this work rather than look like a fallback:
 *
 *  - Deterministic. The same slug always produces the same cover, so a venue
 *    looks identical in search results, on its detail page and in a booking
 *    card. Nothing flickers between renders, and there is no image to preload.
 *  - Hue-spread. Hues are pushed onto a 12-stop wheel rather than taken straight
 *    from the hash, so two cards next to each other are never near-identical.
 */

/** FNV-1a. Small, fast, and well spread for short strings like slugs. */
function hash(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const PATTERNS = ['dots', 'rays', 'grid', 'arcs'];

/**
 * Pattern overlays, expressed as CSS background layers. Each one is a single
 * gradient — cheap to paint, no images, and it survives any theme because the
 * colour is a translucent white/black pair set by the CSS.
 */
const PATTERN_LAYERS = {
  dots: 'radial-gradient(currentColor 1.4px, transparent 1.5px) 0 0 / 14px 14px',
  rays: 'repeating-linear-gradient(115deg, currentColor 0 1.5px, transparent 1.5px 11px)',
  grid: 'linear-gradient(currentColor 1px, transparent 1px) 0 0 / 100% 18px, linear-gradient(90deg, currentColor 1px, transparent 1px) 0 0 / 18px 100%',
  arcs: 'repeating-radial-gradient(circle at 12% 108%, transparent 0 16px, currentColor 16px 17.5px)',
};

/**
 * @param seed  a stable identifier — use the venue slug, never the display name
 *              (renaming a venue should not reshuffle its cover).
 * @returns CSS custom properties to spread into a `style` prop, plus the pattern
 *          name so callers can set a data attribute for the overlay.
 */
export function cover(seed) {
  const h = hash(String(seed));

  // 12 evenly spaced hues, offset so nothing lands on muddy yellow-green.
  const hue = ((h % 12) * 30 + 12) % 360;
  const hue2 = (hue + 26 + ((h >> 8) % 22)) % 360;
  const pattern = PATTERNS[(h >> 4) % PATTERNS.length];
  const angle = 118 + ((h >> 12) % 5) * 14;

  return {
    pattern,
    layer: PATTERN_LAYERS[pattern],
    style: {
      '--cover-h': hue,
      '--cover-h2': hue2,
      '--cover-angle': `${angle}deg`,
      '--cover-pattern': PATTERN_LAYERS[pattern],
    },
  };
}

/**
 * A flat accent colour for the same seed — used where a full cover is too heavy
 * (avatar chips in the console, map pins, waitlist rows).
 */
export function seedHue(seed) {
  return ((hash(String(seed)) % 12) * 30 + 12) % 360;
}
