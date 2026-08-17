/**
 * Owner-side services. Fixture-only: the risk, overbooking and assignment
 * endpoints are the next backend step, so these run the same algorithms in the
 * browser against a generated book.
 */

import { assignTables, naiveAssign } from '../lib/assignment.js';
import { todayISO } from '../lib/format.js';
import { overbookingPlan } from '../lib/overbooking.js';
import { expectedLossPaise, riskBand } from '../lib/risk.js';
import { analyticsFor, floorState, serviceBook, waitlistFor } from '../data/serviceBook.js';
import { getVenue, VENUES } from '../data/venues.js';
import { delay, ServiceError, store } from './config.js';

/** Venues the signed-in owner manages. Demo owner runs a small group. */
const MANAGED = ['olive-and-grove', 'forno-nove', 'salt-and-tide', 'nizam-and-noor', 'peppercorn-house'];

export async function listManagedVenues() {
  await delay(140);
  return MANAGED.map((slug) => getVenue(slug)).filter(Boolean);
}

/** Status overrides survive a reload, so confirming a booking sticks. */
const OVERRIDES_KEY = 'console.overrides';

function applyOverrides(bookings) {
  const overrides = store.read(OVERRIDES_KEY, {});
  return bookings.map((b) => (overrides[b.reference] ? { ...b, ...overrides[b.reference] } : b));
}

export async function getService(slug, date = todayISO()) {
  await delay(340);

  const venue = getVenue(slug);
  if (!venue) throw new ServiceError('Venue not found.', { code: 'NOT_FOUND' });

  const book = serviceBook(venue, date);
  const bookings = applyOverrides(book.bookings);

  const covers = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .reduce((sum, b) => sum + b.partySize, 0);

  const resolved = bookings.filter((b) => ['COMPLETED', 'NO_SHOW'].includes(b.status));
  const noShows = resolved.filter((b) => b.status === 'NO_SHOW');

  return {
    venue,
    date,
    slots: book.slots.map((slot) => ({
      ...slot,
      bookings: applyOverrides(slot.bookings),
    })),
    bookings,
    summary: {
      bookings: bookings.length,
      covers,
      seated: bookings.filter((b) => b.status === 'SEATED').length,
      pending: bookings.filter((b) => b.status === 'PENDING').length,
      noShows: noShows.length,
      /** Rate so far *today* — small denominators, so it stays null early on. */
      noShowRate: resolved.length >= 5 ? noShows.length / resolved.length : null,
      atRisk: bookings.filter(
        (b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.risk.band === 'high',
      ).length,
      /** Money the model expects to walk tonight if nothing is done. */
      exposurePaise: expectedLossPaise(
        bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status)),
        venue.spend,
      ),
    },
  };
}

/** The high-risk queue: what a host should act on, most urgent first. */
export async function getRiskQueue(slug, date = todayISO()) {
  await delay(280);

  const { venue, bookings } = await getService(slug, date);
  const open = bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status));

  return {
    venue,
    date,
    queue: open
      .sort((a, b) => b.risk.probability - a.risk.probability)
      .map((b) => ({
        ...b,
        /** The action the band implies — bands exist to trigger these three. */
        action:
          b.risk.band === 'high'
            ? b.confirmed
              ? 'call'
              : 'remind'
            : b.risk.band === 'medium'
              ? 'remind'
              : 'none',
        exposurePaise: Math.round(b.risk.probability * b.partySize * venue.spend),
      })),
    bands: ['high', 'medium', 'low'].map((band) => ({
      band,
      count: open.filter((b) => b.risk.band === band).length,
      covers: open.filter((b) => b.risk.band === band).reduce((s, b) => s + b.partySize, 0),
    })),
  };
}

export async function getOverbooking(slug, date = todayISO()) {
  await delay(300);

  const { venue, slots } = await getService(slug, date);

  const plan = overbookingPlan(
    slots
      .filter((s) => s.phase !== 'past')
      .map((slot) => ({
        time: slot.time,
        capacityCovers: slot.capacityCovers,
        bookedCovers: slot.bookedCovers,
        bookings: slot.bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status)),
      })),
  );

  return {
    venue,
    date,
    slots: plan,
    /** Slots where the recommendation is actually non-zero. */
    highlights: plan.filter((s) => s.recommendedExtra > 0 || s.isNaiveUnsafe),
    recoverableCovers: plan.reduce((sum, s) => sum + s.recommendedExtra * 2, 0),
    recoverablePaise: plan.reduce((sum, s) => sum + s.recommendedExtra * 2 * venue.spend, 0),
  };
}

export async function getFloor(slug, date = todayISO()) {
  await delay(260);

  const venue = getVenue(slug);
  if (!venue) throw new ServiceError('Venue not found.', { code: 'NOT_FOUND' });

  const tables = floorState(venue, date);
  const parties = waitlistFor(venue, date);
  const free = tables.filter((t) => t.status === 'free');

  const packed = assignTables(free, parties);
  const naive = naiveAssign(free, parties);

  return {
    venue,
    tables,
    parties,
    plan: packed,
    /** The comparison that makes the algorithm's value visible, not claimed. */
    comparison: {
      packedSeated: packed.assignments.length,
      packedWasted: packed.totalWasted,
      naiveSeated: naive.seated,
      naiveWasted: naive.wasted,
      seatsSaved: Math.max(0, naive.wasted - packed.totalWasted),
    },
    occupancy: tables.length
      ? tables.filter((t) => t.status !== 'free').length / tables.length
      : 0,
  };
}

export async function getAnalytics(slug, days = 30) {
  await delay(360);
  const venue = getVenue(slug);
  if (!venue) throw new ServiceError('Venue not found.', { code: 'NOT_FOUND' });
  return { venue, ...analyticsFor(venue, days) };
}

/** Status transition. Persisted so the change survives a refresh. */
export async function updateBookingStatus(reference, status) {
  await delay(320);
  const overrides = store.read(OVERRIDES_KEY, {});
  overrides[reference] = { status, version: (overrides[reference]?.version ?? 1) + 1 };
  store.write(OVERRIDES_KEY, overrides);
  return { reference, status };
}

/** Sending a reminder flips `confirmed`, which re-scores the booking live. */
export async function sendReminder(reference) {
  await delay(420);
  const overrides = store.read(OVERRIDES_KEY, {});
  overrides[reference] = { ...(overrides[reference] ?? {}), reminderSentAt: new Date().toISOString() };
  store.write(OVERRIDES_KEY, overrides);
  return { reference, sent: true };
}

/** Platform-level rollup for the owner landing page. */
export async function getPortfolioSummary() {
  await delay(300);

  const venues = MANAGED.map((slug) => getVenue(slug)).filter(Boolean);
  const rows = venues.map((venue) => {
    const analytics = analyticsFor(venue, 30);
    return {
      venue,
      noShowRate: analytics.noShowRate,
      occupancy: analytics.occupancy,
      lostRevenuePaise: analytics.lostRevenuePaise,
      revenuePerTableHourPaise: analytics.revenuePerTableHourPaise,
      band: riskBand(analytics.noShowRate),
    };
  });

  return {
    rows,
    totals: {
      venues: rows.length,
      seats: venues.reduce((s, v) => s + v.seats, 0),
      lostRevenuePaise: rows.reduce((s, r) => s + r.lostRevenuePaise, 0),
      worstVenue: [...rows].sort((a, b) => b.noShowRate - a.noShowRate)[0],
    },
    /** Everything on the platform, for the "network" framing. */
    platform: { venues: VENUES.length },
  };
}
