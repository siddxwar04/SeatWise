/**
 * Seeded pseudo-random numbers (mulberry32).
 *
 * The demo dataset is generated, not stored — a booking book for a venue is
 * ~60 reservations with risk features, and hand-authoring four of those is
 * fine while hand-authoring twenty-four is not.
 *
 * It has to be *seeded*, though. With `Math.random()` the console would show
 * different numbers on every render, the no-show rate would drift as you clicked
 * between tabs, and nothing would be reproducible when a bug appears. Seeding on
 * the venue slug means Olive & Grove's Tuesday service is identical every time
 * anyone loads it.
 */

/** @returns a function producing floats in [0, 1). */
export function prng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** String → 32-bit seed, so slugs can seed generators directly. */
export function seedFrom(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small set of shaping helpers over one stream. */
export function rng(seedText) {
  const next = prng(seedFrom(String(seedText)));

  return {
    next,
    /** Integer in [min, max], inclusive. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** Float in [min, max). */
    float: (min, max) => min + next() * (max - min),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** One element. */
    pick: (list) => list[Math.floor(next() * list.length)],
    /** `count` distinct elements (or the whole list if it is shorter). */
    sample: (list, count) => {
      const pool = [...list];
      const out = [];
      while (out.length < count && pool.length) {
        out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      }
      return out;
    },
    /** Weighted pick: `[[value, weight], …]`. */
    weighted: (pairs) => {
      const total = pairs.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of pairs) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
  };
}
