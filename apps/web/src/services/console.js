/**
 * Owner-side services. Fixture-only: the risk, overbooking and assignment
 * endpoints are the next backend step, so these run the same algorithms in the
 * browser against a generated book.
 */

import { adminApi, dashboardApi, restaurantApi } from '../lib/api.js';
import { assignTables, naiveAssign } from '../lib/assignment.js';
import { todayISO } from '../lib/format.js';
import { overbookingPlan } from '../lib/overbooking.js';
import { expectedLossPaise, riskBand } from '../lib/risk.js';
import { analyticsFor, floorState, serviceBook, slotGrid, waitlistFor } from '../data/serviceBook.js';
import { getVenue, VENUES } from '../data/venues.js';
import { delay, LIVE_API, ServiceError, store } from './config.js';

/** Venues the signed-in owner manages. Demo owner runs a small group. */
const MANAGED = [
  'olive-and-grove',
  'forno-nove',
  'salt-and-tide',
  'nizam-and-noor',
  'peppercorn-house',
];

/** Mirrors the API's SPEND_PER_COVER_PAISE (analytics.service.js) so exposure
 *  math stays consistent even for real restaurants outside the venue fixture. */
const SPEND_PER_COVER_PAISE = { 1: 40_000, 2: 80_000, 3: 150_000, 4: 250_000 };

/** Fallback service window for a real restaurant with no fixture entry. */
const DEFAULT_HOURS = { open: '11:00', close: '23:30' };

/** A venue is fixture-directory data (name/image/copy) that a real restaurant
 *  may or may not have an entry for. Falls back to the live record itself so
 *  the console never hard-fails on a restaurant outside the 34-venue fixture. */
async function resolveVenue(slug) {
  const fixture = getVenue(slug);
  if (!LIVE_API) return fixture;

  try {
    const { restaurant } = await restaurantApi.get(slug);
    return {
      ...fixture,
      ...restaurant,
      slug: restaurant.slug,
      name: restaurant.name,
      image: fixture?.image ?? null,
      spend: SPEND_PER_COVER_PAISE[restaurant.priceLevel ?? 2] ?? SPEND_PER_COVER_PAISE[2],
    };
  } catch {
    return fixture ?? { slug, name: slug, image: null, spend: SPEND_PER_COVER_PAISE[2] };
  }
}

export async function listManagedVenues() {
  if (LIVE_API) {
    const { restaurants } = await restaurantApi.mine();
    return restaurants.map((r) => ({ ...getVenue(r.slug), ...r }));
  }

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
  if (LIVE_API) {
    const venue = await resolveVenue(slug);
    const data = await adminApi.serviceToday(slug);
    const bookings = applyOverrides(data.reservations);
    const open = bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status));

    return {
      venue,
      date,
      // No slot-grouping endpoint yet — Tonight's book renders the flat list;
      // Overbooking (which needs slots) stays fixture-driven for now.
      slots: [],
      bookings,
      summary: {
        bookings: bookings.length,
        covers: data.covers,
        seated: bookings.filter((b) => b.status === 'SEATED').length,
        pending: bookings.filter((b) => b.status === 'PENDING').length,
        // serviceToday only returns still-open bookings, so today's settled
        // count isn't knowable from this endpoint — see the Analytics tab
        // for the real (30-day) no-show rate instead.
        noShows: 0,
        noShowRate: null,
        atRisk: open.filter((b) => b.risk.band === 'high').length,
        exposurePaise: expectedLossPaise(open, venue.spend),
      },
    };
  }

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

/**
 * A plain-language reason, not a weighted attribution: the real model's
 * coefficients (weights.lr-js-v1.json) live server-only, so an exact "which
 * feature moved the score most" can't be reproduced client-side. This picks
 * the first signal that applies, ordered by the model's own doc comments on
 * which features matter most (guest history first, then confirmation status,
 * then timing) — a defensible "why", not a fabricated precise ranking.
 */
function riskDriverLabel(row, date) {
  const priorBookings = row.guest?.priorBookings ?? 0;
  const priorNoShows = row.guest?.priorNoShows ?? 0;
  if (priorNoShows > 0) {
    return `${priorNoShows} prior no-show${priorNoShows === 1 ? '' : 's'} in ${priorBookings} bookings`;
  }
  if (row.status !== 'CONFIRMED') return 'Not yet confirmed';
  if (row.time >= '21:00') return 'Late seating (9pm or later)';
  const weekday = new Date(`${date}T00:00:00`).getDay();
  if (weekday === 0 || weekday === 5 || weekday === 6) return 'Weekend booking';
  if ((row.leadTimeDays ?? 0) >= 14) return 'Booked far in advance';
  if (row.partySize >= 6) return 'Large party';
  return 'No single strong factor';
}

/** The high-risk queue: what a host should act on, most urgent first. */
export async function getRiskQueue(slug, date = todayISO()) {
  if (LIVE_API) {
    const venue = await resolveVenue(slug);
    const data = await adminApi.riskQueue(slug, date);
    return {
      venue,
      date,
      queue: data.queue.map((row) => ({
        ...row,
        risk: {
          band: row.band,
          probability: row.noShowRisk ?? 0,
          drivers: [{ label: riskDriverLabel(row, date) }],
        },
      })),
      bands: data.bands,
    };
  }

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
  if (LIVE_API) {
    const [venue, service, tablesData] = await Promise.all([
      resolveVenue(slug),
      adminApi.serviceToday(slug),
      adminApi.tables(slug),
    ]);

    const capacityCovers =
      tablesData.tables.reduce((sum, t) => sum + t.capacity, 0) || venue.seats || 40;
    const grid = slotGrid({ hours: venue.hours ?? DEFAULT_HOURS });

    // No slot-grouping endpoint yet: bookings carry the exact HH:MM they were
    // booked into (the same grid the booking form offers), so a direct time
    // match reproduces slot grouping without an interval-overlap query.
    const slotsInput = grid.map((time) => {
      const slotBookings = service.reservations.filter((b) => b.time === time);
      return {
        time,
        capacityCovers,
        bookedCovers: slotBookings.reduce((sum, b) => sum + b.partySize, 0),
        bookings: slotBookings,
      };
    });

    const plan = overbookingPlan(slotsInput);

    return {
      venue,
      date,
      slots: plan,
      highlights: plan.filter((s) => s.recommendedExtra > 0 || s.isNaiveUnsafe),
      recoverableCovers: plan.reduce((sum, s) => sum + s.recommendedExtra * 2, 0),
      recoverablePaise: plan.reduce((sum, s) => sum + s.recommendedExtra * 2 * venue.spend, 0),
    };
  }

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

/** Minutes since a waitlist entry was created — the server doesn't compute this. */
function withWaitedMinutes(entry) {
  return {
    ...entry,
    waitedMinutes: Math.max(0, Math.round((Date.now() - new Date(entry.createdAt).getTime()) / 60_000)),
  };
}

export async function getFloor(slug, date = todayISO()) {
  if (LIVE_API) {
    const [venue, floorData, waitlistData] = await Promise.all([
      resolveVenue(slug),
      adminApi.floor(slug),
      dashboardApi.waitlist(slug, 'WAITING'),
    ]);

    const tables = floorData.tables.map((t) => ({ ...t, seats: t.capacity }));
    const parties = waitlistData.entries.map(withWaitedMinutes);

    const assignments = [];
    const unassigned = [];
    try {
      const { slots } = await dashboardApi.assignWaitlist(slug, { apply: false });
      for (const slot of slots) {
        assignments.push(
          ...slot.assignments.map((a) => ({
            ...a,
            party: withWaitedMinutes(a.party),
            wasted: a.wastedSeats,
          })),
        );
        // The best-fit planner doesn't report why a party couldn't be seated —
        // "no free table fits" is the only reason it can ever return.
        unassigned.push(
          ...slot.unassigned.map((entry) => ({
            party: withWaitedMinutes(entry),
            reason: 'No free table fits this party right now.',
          })),
        );
      }
    } catch {
      // Nobody waiting, or the plan endpoint errored — an empty plan is safe.
    }

    const seated = tables.filter((t) => t.status !== 'free').length;
    const wasted = assignments.reduce((sum, a) => sum + (a.wasted ?? 0), 0);

    return {
      venue,
      tables,
      parties,
      plan: { assignments, unassigned },
      // No naive (first-fit) baseline from the server — the comparison this
      // panel highlights is a fixture-only feature until that's added.
      comparison: {
        packedSeated: assignments.length,
        packedWasted: wasted,
        naiveSeated: assignments.length,
        naiveWasted: wasted,
        seatsSaved: 0,
      },
      occupancy: tables.length ? seated / tables.length : 0,
    };
  }

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
    occupancy: tables.length ? tables.filter((t) => t.status !== 'free').length / tables.length : 0,
  };
}

export async function getAnalytics(slug, days = 30) {
  if (LIVE_API) {
    const [venue, data] = await Promise.all([resolveVenue(slug), adminApi.analytics(slug, days)]);
    return {
      venue,
      ...data,
      occupancy: data.occupancyRate,
      noShowRate: data.noShowRate == null ? null : data.noShowRate / 100,
    };
  }

  const venue = getVenue(slug);
  if (!venue) throw new ServiceError('Venue not found.', { code: 'NOT_FOUND' });

  await delay(360);
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
  overrides[reference] = {
    ...(overrides[reference] ?? {}),
    reminderSentAt: new Date().toISOString(),
  };
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
