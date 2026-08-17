/**
 * Overbooking recommendation — expected value, done properly.
 *
 * The failure mode the brief describes is a restaurant that got burned by
 * no-shows, decided to "just take extra bookings", and put three parties of four
 * into two four-tops. All three showed. That is not an overbooking problem, it is
 * an *unquantified* overbooking problem.
 *
 * The fix is the airline one. An airline sells 110 seats on a 100-seat plane
 * because it knows the distribution of no-shows, not because 10 feels lucky. So:
 *
 *   1. Every booking in the slot already has its own no-show probability from
 *      risk.js. They are different — that is the whole point.
 *   2. The number of no-shows in the slot is therefore a sum of independent
 *      Bernoulli trials with *different* probabilities: a Poisson-binomial.
 *   3. With the exact distribution in hand, the question stops being "how many
 *      extra should we take?" and becomes "what is the largest number of extra
 *      bookings that keeps the chance of turning someone away under 5%?"
 *
 * Step 3 is the part that separates this from summing probabilities and rounding
 * down. Expected no-shows of 0.8 does not mean one extra booking is safe: with
 * two bookings at p=0.4 each, the expected value is 0.8 but there is a 36% chance
 * that *nobody* no-shows. `floor(E)` would overbook straight into the 1-star
 * review. The tolerance-based answer refuses that.
 */

/**
 * Exact Poisson-binomial PMF by dynamic programming.
 *
 * `pmf[k]` = P(exactly k of the bookings no-show).
 *
 * O(n²), which is nothing at restaurant scale (a busy slot is under 40 bookings).
 * The normal approximation would be faster and wrong in exactly the region that
 * matters here — small n, small p, the tail near zero.
 */
export function poissonBinomialPmf(probabilities) {
  let pmf = [1];

  for (const p of probabilities) {
    const next = new Array(pmf.length + 1).fill(0);
    for (let k = 0; k < pmf.length; k += 1) {
      next[k] += pmf[k] * (1 - p); // this booking shows
      next[k + 1] += pmf[k] * p; // this booking no-shows
    }
    pmf = next;
  }

  return pmf;
}

/** P(N ≤ k) from a PMF. */
function cdf(pmf, k) {
  if (k < 0) return 0;
  return pmf.slice(0, Math.min(k + 1, pmf.length)).reduce((a, b) => a + b, 0);
}

/**
 * Default no-show probability assigned to a booking that has not been taken yet.
 *
 * An extra booking accepted for tonight is by definition short-lead, and short
 * lead time is the strongest protective feature in the model — so these are
 * *lower* risk than the average booking already in the slot. 12% is roughly what
 * risk.js returns for an unconfirmed same-day party of two.
 */
export const NEW_BOOKING_RISK = 0.12;

/**
 * @param {object} input
 * @param {number}   input.capacityCovers  seats the slot can actually serve
 * @param {number[]} input.probabilities   one no-show probability per booking held
 * @param {number}   [input.tolerance]     acceptable P(turning someone away)
 * @param {number}   [input.maxExtra]      hard cap on the recommendation
 * @param {number}   [input.avgPartySize]  covers per extra booking, for the maths
 */
export function recommendOverbooking({
  capacityCovers,
  probabilities,
  bookedCovers,
  tolerance = 0.05,
  maxExtra = 6,
  avgPartySize = 2,
}) {
  const held = probabilities.length;
  const expectedNoShows = probabilities.reduce((a, p) => a + p, 0);
  const variance = probabilities.reduce((a, p) => a + p * (1 - p), 0);

  // Seats already sitting spare before any overbooking. A slot with room left
  // does not need an expected-value argument — it needs bookings.
  const spareCovers = Math.max(0, capacityCovers - bookedCovers);

  const options = [];
  for (let extra = 1; extra <= maxExtra; extra += 1) {
    // Accepting `extra` more bookings adds their own no-show risk to the pool.
    const pmf = poissonBinomialPmf([
      ...probabilities,
      ...Array.from({ length: extra }, () => NEW_BOOKING_RISK),
    ]);

    // Arrivals overflow capacity when fewer covers no-show than we oversold by.
    // Covers, not bookings: two extra parties of two need four seats to free up.
    const coversNeeded = Math.ceil((extra * avgPartySize - spareCovers) / avgPartySize);
    const overflowProbability = coversNeeded <= 0 ? 0 : cdf(pmf, coversNeeded - 1);

    options.push({
      extra,
      overflowProbability,
      /** Covers recovered if it goes to plan — the upside being traded off. */
      coversRecovered: extra * avgPartySize,
      withinTolerance: overflowProbability <= tolerance,
    });
  }

  // The largest option still inside tolerance. Options are monotone in `extra`,
  // so this is the frontier, not a search.
  const safe = options.filter((o) => o.withinTolerance);
  const recommendedExtra = safe.length ? safe[safe.length - 1].extra : 0;
  const naive = Math.floor(expectedNoShows / avgPartySize);

  return {
    held,
    expectedNoShows,
    standardDeviation: Math.sqrt(variance),
    spareCovers,
    recommendedExtra,
    /**
     * What `floor(Σ p)` would have said. Shown side by side in the console
     * because the gap between the two *is* the feature: when the naive number is
     * higher, it is quietly betting on the tail.
     */
    naiveExtra: naive,
    isNaiveUnsafe: naive > recommendedExtra,
    tolerance,
    options,
    /** P(nobody in this slot no-shows) — the number that ruins naive overbooking. */
    probabilityAllShow: poissonBinomialPmf(probabilities)[0] ?? 1,
  };
}

/**
 * Slot-level summary for the console's overbooking table.
 * `slots` is `[{ time, capacityCovers, bookedCovers, bookings: [{ partySize, risk }] }]`.
 */
export function overbookingPlan(slots, options = {}) {
  return slots.map((slot) => {
    const probabilities = slot.bookings.map((b) => b.risk.probability);
    const avgPartySize = slot.bookings.length
      ? slot.bookings.reduce((a, b) => a + b.partySize, 0) / slot.bookings.length
      : 2;

    return {
      ...slot,
      ...recommendOverbooking({
        capacityCovers: slot.capacityCovers,
        bookedCovers: slot.bookedCovers,
        probabilities,
        avgPartySize: Math.max(2, Math.round(avgPartySize)),
        ...options,
      }),
      utilisation: slot.capacityCovers ? slot.bookedCovers / slot.capacityCovers : 0,
    };
  });
}
