import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const weights = require('./weights.lr-js-v1.json');

/**
 * Path A no-show model: logistic regression in plain JS.
 *
 *   P(no-show) = sigmoid(bias + w · x)
 *
 * Features match the brief: lead time, party size, day/time, the guest's own
 * no-show history, confirmation status. Weights are hand-picked for an MVP
 * with no labelled history; retrain by replacing weights.lr-js-v1.json
 * (or swap this module's internals for a Python /score call later).
 *
 * The rest of the backend MUST go through scoreNoShowRisk() so Path B is a
 * drop-in, not a rewrite of booking.service.
 */

export const RISK_MODEL_VERSION = weights.version;

/** Owner-dashboard badge cutoffs from the product brief. */
export const RISK_LEVEL = {
  low: 0.2,
  high: 0.5,
};

export function riskLevel(probability) {
  if (probability == null || Number.isNaN(probability)) return null;
  if (probability >= RISK_LEVEL.high) return 'high';
  if (probability >= RISK_LEVEL.low) return 'medium';
  return 'low';
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sigmoid(z) {
  // Overflow-safe: exp(±60) already saturates float enough for a probability.
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Turn a booking-shaped object into the 0–1 features the weights expect.
 *
 * `leadTimeHours` — longer notice → slightly higher no-show (plans change).
 * `partySize`     — larger groups flake more.
 * `isWeekend`     — Fri/Sat/Sun dinner is the high-variance window.
 * `isLate`        — 21:00+ walk-backs.
 * `guestNoShowRate` — strongest lever; a 50% history overwhelms the priors.
 * `isConfirmed`   — SMS/email confirm is treated as a real commitment.
 */
export function extractFeatures(booking) {
  const leadHours = Number(booking.leadTimeHours ?? 0);
  const partySize = Number(booking.partySize ?? 1);
  const priorBookings = Number(booking.priorBookings ?? 0);
  const priorNoShows = Number(booking.priorNoShows ?? 0);

  const guestNoShowRate =
    priorBookings <= 0 ? 0 : clamp01(priorNoShows / priorBookings);

  const dayOfWeek = Number(booking.dayOfWeek ?? 0);
  const hour = Number(booking.hour ?? 0);
  const isWeekend = Boolean(booking.isWeekend) || dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

  return {
    leadTime: clamp01(leadHours / 336),
    partySize: clamp01(partySize / 10),
    isWeekend: isWeekend ? 1 : 0,
    isLate: hour >= 21 ? 1 : 0,
    guestNoShowRate,
    isConfirmed: booking.isConfirmed ? 1 : 0,
  };
}

export function scoreNoShowRisk(booking) {
  const features = extractFeatures(booking);
  const { bias, coeffs } = weights;
  const z =
    bias +
    coeffs.leadTime * features.leadTime +
    coeffs.partySize * features.partySize +
    coeffs.isWeekend * features.isWeekend +
    coeffs.isLate * features.isLate +
    coeffs.guestNoShowRate * features.guestNoShowRate +
    coeffs.isConfirmed * features.isConfirmed;

  return clamp01(sigmoid(z));
}

/**
 * Convenience wrapper used at insert / confirm time. Never throws — a booking
 * must succeed even if feature extraction got a weird input.
 */
export function scoreReservation(input) {
  try {
    const probability = scoreNoShowRisk(input);
    return { noShowRisk: Number(probability.toFixed(4)), riskModelVersion: RISK_MODEL_VERSION };
  } catch {
    return { noShowRisk: null, riskModelVersion: null };
  }
}
