/**
 * No-show risk model — logistic regression, evaluated in the browser.
 *
 * This is the core of the product: the window between "reservation made" and
 * "guest arrives" is the one thing OpenTable and Resy do not score for you.
 *
 * ── Why a hand-set logistic model, and not a trained one ────────────────────
 * A real deployment trains this on the venue's own history (the Python service
 * in the roadmap). What ships here is the same *functional form* with published
 * coefficients: a linear combination of features through a sigmoid. That matters
 * for the UI, because the two things the dashboard has to do — rank bookings by
 * risk, and explain a score — depend on the form, not on where the weights came
 * from. Swapping in fitted weights later changes this file's constants and
 * nothing else.
 *
 * ── Features ────────────────────────────────────────────────────────────────
 * Straight from the brief: lead time, party size, day/time, the guest's own
 * no-show history, and confirmation status. Each one has a documented reason to
 * be here; none of them are "we had the column".
 *
 * ── Calibration ─────────────────────────────────────────────────────────────
 * The coefficients are set so the two worked examples in the research brief
 * reproduce (see `SCENARIOS` at the bottom, which the console links to):
 *
 *   Booking A — 3 months out, party of 2, unconfirmed, first-timer, Sat 8 PM
 *               → ~0.72   (brief says "70% risk")
 *   Booking B — booked yesterday, party of 4, SMS-confirmed, 10 clean visits
 *               → ~0.04   (brief says "5% risk")
 */

/** Model coefficients. `bias` is the log-odds of a no-show for a blank booking. */
export const WEIGHTS = {
  bias: -2.05,

  /**
   * Lead time, as log(1 + days).
   *
   * Log, not linear: the difference between booking today and booking three
   * weeks out is enormous, while the difference between two months and three
   * months is almost nothing. A linear term would make a 90-day booking 90×
   * riskier than a 1-day one, which is not what any restaurant sees.
   */
  leadTimeLog: 0.45,

  /**
   * Party size, per cover.
   *
   * Negative — and it surprises people. Bigger parties no-show *less*: they are
   * usually an occasion, someone in the group has told everyone else, and the
   * social cost of bailing is higher. The financial damage per no-show is of
   * course larger, but that belongs in the cost model, not the probability.
   */
  partySize: -0.06,

  /** An answered confirmation is the single strongest protective signal. */
  confirmed: -1.15,

  /** Each past no-show by this guest. The strongest risk signal there is. */
  priorNoShow: 0.95,

  /** Per prior honoured visit, capped — loyalty saturates. */
  priorVisit: -0.05,
  priorVisitCap: 12,

  /** No history at all is riskier than a thin good history. */
  firstTime: 0.7,

  /** Fri/Sat: more competing plans, more "we ended up somewhere else". */
  weekend: 0.25,

  /** 19:00–21:00. Prime time is exactly where a no-show costs the most. */
  primeTime: 0.2,

  /** Money down changes behaviour more than any reminder. */
  prepaid: -1.0,

  /** Deposit held (card on file, not charged) — weaker than prepaid. */
  deposit: -0.55,
};

/**
 * Clamp range.
 *
 * A model that outputs 0.4% or 99% invites the host to treat a probability as a
 * certainty. Nothing is ever certain to show, and nothing is ever hopeless, so
 * scores are held inside a band the floor staff can act on.
 */
const FLOOR = 0.02;
const CEILING = 0.92;

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * @param {object} f                    feature vector
 * @param {number} f.leadTimeDays       days between booking and service
 * @param {number} f.partySize
 * @param {boolean} f.confirmed         guest answered the confirmation
 * @param {number} [f.priorNoShows]
 * @param {number} [f.priorVisits]
 * @param {boolean} [f.weekend]
 * @param {boolean} [f.primeTime]
 * @param {boolean} [f.prepaid]
 * @param {boolean} [f.deposit]
 * @returns {{probability:number, band:'low'|'medium'|'high', logOdds:number,
 *            drivers:Array<{label:string, effect:number, direction:1|-1}>}}
 */
export function noShowRisk(f) {
  const priorVisits = Math.min(f.priorVisits ?? 0, WEIGHTS.priorVisitCap);
  const priorNoShows = f.priorNoShows ?? 0;
  const firstTime = priorVisits === 0 && priorNoShows === 0;

  // Each term is kept as a labelled contribution rather than being summed
  // inline, because the dashboard has to answer "why is this 70%?" — a bare
  // number gets ignored by staff, an explained one gets acted on.
  const terms = [
    {
      label: `Booked ${f.leadTimeDays} day${f.leadTimeDays === 1 ? '' : 's'} ahead`,
      effect: WEIGHTS.leadTimeLog * Math.log1p(Math.max(0, f.leadTimeDays)),
    },
    {
      label: `Party of ${f.partySize}`,
      effect: WEIGHTS.partySize * f.partySize,
    },
    {
      label: f.confirmed ? 'Confirmation answered' : 'Not confirmed',
      effect: f.confirmed ? WEIGHTS.confirmed : 0,
    },
    {
      label: `${priorNoShows} prior no-show${priorNoShows === 1 ? '' : 's'}`,
      effect: WEIGHTS.priorNoShow * priorNoShows,
    },
    {
      label: `${priorVisits} previous visit${priorVisits === 1 ? '' : 's'}`,
      effect: WEIGHTS.priorVisit * priorVisits,
    },
    { label: 'First-time guest', effect: firstTime ? WEIGHTS.firstTime : 0 },
    { label: 'Weekend service', effect: f.weekend ? WEIGHTS.weekend : 0 },
    { label: 'Prime-time slot', effect: f.primeTime ? WEIGHTS.primeTime : 0 },
    { label: 'Prepaid ticket', effect: f.prepaid ? WEIGHTS.prepaid : 0 },
    { label: 'Card held', effect: f.deposit && !f.prepaid ? WEIGHTS.deposit : 0 },
  ];

  const logOdds = terms.reduce((sum, t) => sum + t.effect, WEIGHTS.bias);
  const probability = Math.min(CEILING, Math.max(FLOOR, sigmoid(logOdds)));

  return {
    probability,
    logOdds,
    band: riskBand(probability),
    /** Non-zero terms, largest absolute effect first — the "why" list. */
    drivers: terms
      .filter((t) => Math.abs(t.effect) > 0.01)
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .map((t) => ({ ...t, direction: t.effect > 0 ? 1 : -1 })),
  };
}

/**
 * Thresholds.
 *
 * 0.20 and 0.50 are operational, not statistical: below 20% you leave it alone,
 * 20–50% is worth a reminder text, above 50% is worth a phone call or a card
 * hold. The bands exist to trigger those three actions.
 */
export function riskBand(probability) {
  if (probability >= 0.5) return 'high';
  if (probability >= 0.2) return 'medium';
  return 'low';
}

export const BAND_LABEL = { low: 'Low risk', medium: 'Watch', high: 'High risk' };

/**
 * Rupee cost of the expected no-shows in a set of bookings.
 *
 * The brief's arithmetic: a 10–20% no-show rate on a ~₹3,700 average check is
 * ₹450–900 a night lost against 3–5% net margins. This is the same sum, done per
 * slot with per-booking probabilities instead of a flat rate.
 */
export function expectedLossPaise(bookings, averageCheckPaise) {
  return Math.round(
    bookings.reduce((sum, b) => sum + b.risk.probability * b.partySize * averageCheckPaise, 0),
  );
}

/**
 * The two worked examples from the research brief, kept next to the model so the
 * calibration claim above is checkable rather than asserted. The console renders
 * these on the model-explainer panel.
 */
export const SCENARIOS = [
  {
    id: 'a',
    title: 'Booking A',
    summary: 'Made 3 months ahead · party of 2 · never confirmed · first-time guest',
    features: {
      leadTimeDays: 90,
      partySize: 2,
      confirmed: false,
      priorVisits: 0,
      priorNoShows: 0,
      weekend: true,
      primeTime: true,
    },
  },
  {
    id: 'b',
    title: 'Booking B',
    summary: 'Made yesterday · party of 4 · confirmed by SMS · 10 visits, always showed',
    features: {
      leadTimeDays: 1,
      partySize: 4,
      confirmed: true,
      priorVisits: 10,
      priorNoShows: 0,
      weekend: true,
      primeTime: true,
    },
  },
];
