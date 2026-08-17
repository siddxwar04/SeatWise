/**
 * Diner-side services: search, venue detail, availability, bookings, waitlist.
 *
 * Search is fixture-only — there is no cross-venue availability endpoint yet.
 * Bookings route through the reservations API when `VITE_LIVE_API=true`.
 */

import { minutesOf, todayISO } from '../lib/format.js';
import { assignTables } from '../lib/assignment.js';
import { CITIES, getCity } from '../data/cities.js';
import { ratingBreakdown, reviewsFor } from '../data/people.js';
import { floorState, waitlistFor } from '../data/serviceBook.js';
import { getVenue, VENUES, venuesInCity } from '../data/venues.js';
import { reservationApi, waitlistApi } from '../lib/api.js';
import { delay, LIVE_API, ServiceError, store } from './config.js';

/* ─────────────────────────────────────────────────────────────── search ── */

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function matchesText(venue, query) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  return [venue.name, venue.cuisine, venue.area, venue.tagline, ...(venue.signatures ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/**
 * Can this venue physically take the party? Two joined tables count — a real
 * host action — but it is reported separately so the card can say so instead of
 * promising a six-top that does not exist.
 */
function capacityFor(venue, party) {
  if (venue.maxTableSeats >= party) return { bookable: true, combining: false };
  const twoLargest = [...venue.tables]
    .sort((a, b) => b.seats - a.seats)
    .slice(0, 2)
    .reduce((sum, t) => sum + t.seats, 0);
  return { bookable: twoLargest >= party, combining: twoLargest >= party };
}

/**
 * ±90 minutes: "8pm" from a diner means "dinner". Showing nothing for 20:00
 * while a 19:45 sits unbooked is the commonest complaint about booking search.
 */
function slotsNear(venue, time, window = 90) {
  const target = minutesOf(time);
  return venue.slots
    .map((slot) => ({ ...slot, offset: minutesOf(slot.time) - target }))
    .filter((slot) => Math.abs(slot.offset) <= window)
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
}

/**
 * Ranking is a product decision, so it is written down: availability at the
 * requested time dominates, then rating, then curation, then proximity. No paid
 * placement.
 */
function relevanceScore(venue, near) {
  const exact = near.some((s) => s.offset === 0) ? 30 : 0;
  const close = near.length ? Math.max(0, 18 - Math.abs(near[0].offset) / 5) : 0;
  const availability = Math.min(12, near.length * 3);
  const quality = (venue.rating - 4) * 14;
  const editorial = venue.curated ? 6 : 0;
  const proximity = Math.max(0, 8 - (venue.km ?? 0));
  return exact + close + availability + quality + editorial + proximity;
}

const SORTERS = {
  relevance: (a, b) => b._score - a._score,
  availability: (a, b) => b.slotsNear.length - a.slotsNear.length || b.remaining - a.remaining,
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  nearby: (a, b) => a.km - b.km,
  'price-asc': (a, b) => a.price - b.price || b.rating - a.rating,
  'price-desc': (a, b) => b.price - a.price || b.rating - a.rating,
};

export async function searchVenues(q) {
  await delay(320);

  const {
    city = 'pune',
    text = '',
    areas = [],
    cuisines = [],
    prices = [],
    quick = [],
    party = 2,
    time = '20:00',
    sort = 'relevance',
  } = q ?? {};

  const venues = venuesInCity(city)
    .map((venue) => {
      const near = slotsNear(venue, time);
      return {
        ...venue,
        slotsNear: near,
        bestSlot: near.find((s) => s.offset === 0) ?? near[0] ?? null,
        ...capacityFor(venue, party),
        _score: relevanceScore(venue, near),
      };
    })
    .filter((venue) => {
      if (!matchesText(venue, text)) return false;
      if (areas.length && !areas.includes(venue.area)) return false;
      if (cuisines.length && !cuisines.includes(venue.cuisine)) return false;
      if (prices.length && !prices.includes(venue.price)) return false;
      // Party size changes the result set rather than decorating the rail.
      if (!venue.bookable) return false;

      for (const filter of quick) {
        if (filter === 'tonight' && venue.slotsNear.length === 0) return false;
        if (filter === 'walkin' && !venue.walkIn) return false;
        if (filter === 'counter' && !venue.zones.includes('COUNTER')) return false;
        if (filter === 'experience' && venue.type !== 'experience') return false;
        if (filter === 'outdoor' && !venue.zones.includes('OUTDOOR')) return false;
        if (filter === 'group' && venue.maxTableSeats < 6) return false;
        if (filter === 'soon') {
          const soon = venue.slots.some((s) => {
            const delta = minutesOf(s.time) - nowMinutes();
            return delta >= 0 && delta <= 30;
          });
          if (!soon) return false;
        }
      }
      return true;
    })
    .sort(SORTERS[sort] ?? SORTERS.relevance);

  return {
    city: getCity(city),
    venues,
    total: venues.length,
    bookableNow: venues.filter((v) => v.slotsNear.length > 0).length,
    /** Editorial lane — runs alongside results, never replaces them. */
    curated: venuesInCity(city).filter((v) => v.curated),
  };
}

export async function listCities() {
  await delay(120);
  return CITIES.map((city) => ({ ...city, venueCount: venuesInCity(city.slug).length }));
}

/* ─────────────────────────────────────────────────────────── venue page ── */

export async function getVenueDetail(slug) {
  await delay(280);

  const venue = getVenue(slug);
  if (!venue) throw new ServiceError('That restaurant is no longer listed.', { code: 'NOT_FOUND' });

  const similar = VENUES.filter(
    (v) => v.slug !== venue.slug && (v.cuisine === venue.cuisine || v.area === venue.area),
  )
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  return { venue, reviews: reviewsFor(venue), ratings: ratingBreakdown(venue), similar, city: getCity(venue.city) };
}

/**
 * Each slot carries *why* it is unavailable. A greyed-out button with no
 * explanation just reads as broken.
 */
export async function getAvailability(slug, { date = todayISO(), party = 2, zone = null } = {}) {
  await delay(240);

  const venue = getVenue(slug);
  if (!venue) throw new ServiceError('Restaurant not found.', { code: 'NOT_FOUND' });

  const { bookable, combining } = capacityFor(venue, party);
  const tablesThatFit = venue.tables.filter((t) => t.seats >= party && (!zone || t.zone === zone)).length;

  const slots = venue.slots.map((slot) => {
    const blocked = !bookable
      ? 'Party too large for this room'
      : tablesThatFit === 0
        ? 'No table this size in that area'
        : null;
    return { ...slot, available: !blocked, reason: blocked, combining, last: slot.scarce };
  });

  return {
    venue,
    date,
    party,
    zone,
    slots,
    alternativeDates: [1, 2, 3].map((offset) => ({
      date: todayISO(offset),
      slots: Math.max(1, venue.slots.length - offset),
    })),
    policy: venue.policy,
    combining,
  };
}

/* ───────────────────────────────────────────────────────────── bookings ── */

const BOOKINGS_KEY = 'bookings';

/**
 * What a *guest* sees. Deliberately carries no risk score: the model exists to
 * help a restaurant plan, and telling a guest "we think you are 62% likely to
 * flake" would be both rude and self-defeating.
 */
function publicBooking(record) {
  const venue = getVenue(record.venueSlug);
  return {
    ...record,
    venue: venue
      ? { slug: venue.slug, name: venue.name, area: venue.area, city: venue.city, type: venue.type, image: venue.image }
      : { slug: record.venueSlug, name: record.venueName },
  };
}

function readBookings() {
  return store.read(BOOKINGS_KEY, null) ?? seedBookings();
}

/** First-run seed. An empty list is right for a new account and useless in a demo. */
function seedBookings() {
  const guest = { name: 'You', phone: '+91 98 1234 5678' };
  const seeded = [
    {
      reference: 'SW-4KQ7MB',
      venueSlug: 'forno-nove',
      venueName: 'Forno Nove',
      date: todayISO(2),
      time: '20:00',
      partySize: 2,
      zone: 'OUTDOOR',
      status: 'CONFIRMED',
      guest,
      note: null,
      prepaidPaise: null,
      createdAt: new Date(Date.now() - 36 * 3600_000).toISOString(),
    },
    {
      reference: 'SW-9XR2TC',
      venueSlug: 'the-saffron-room',
      venueName: 'The Saffron Room',
      date: todayISO(-9),
      time: '20:30',
      partySize: 4,
      zone: 'PRIVATE',
      status: 'COMPLETED',
      guest,
      note: 'Anniversary',
      prepaidPaise: 250000,
      createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    },
    {
      reference: 'SW-2LMD8H',
      venueSlug: 'salt-and-tide',
      venueName: 'Salt & Tide',
      date: todayISO(-24),
      time: '19:00',
      partySize: 2,
      zone: null,
      status: 'CANCELLED',
      guest,
      note: null,
      prepaidPaise: null,
      createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    },
  ];
  store.write(BOOKINGS_KEY, seeded);
  return seeded;
}

export async function listMyBookings({ filter = 'upcoming' } = {}) {
  await delay(260);

  if (LIVE_API) {
    const data = await reservationApi.mine(filter === 'upcoming' ? { upcoming: 'true' } : {});
    return data.reservations.map(publicBooking);
  }

  const today = todayISO();
  const all = readBookings().map(publicBooking);
  const list =
    filter === 'upcoming'
      ? all.filter((b) => b.date >= today && ['PENDING', 'CONFIRMED'].includes(b.status))
      : all;

  return list.sort((a, b) =>
    filter === 'upcoming'
      ? a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
      : b.date.localeCompare(a.date),
  );
}

export async function createBooking(payload) {
  await delay(560);

  const venue = getVenue(payload.venueSlug);
  if (!venue) throw new ServiceError('Restaurant not found.', { code: 'NOT_FOUND' });

  // Error shape mirrors the API's so the form's error rendering is identical
  // either way.
  const details = {};
  if (!payload.guest?.name?.trim()) details.name = 'Tell the restaurant who to expect.';
  if (!/^[+\d][\d\s-]{7,}$/.test(payload.guest?.phone ?? '')) {
    details.phone = 'A reachable number, please — the venue may need to call.';
  }
  if (Object.keys(details).length) {
    throw new ServiceError('Check the highlighted fields.', { code: 'VALIDATION', details });
  }

  if (LIVE_API) {
    const created = await reservationApi.create({
      restaurantSlug: payload.venueSlug,
      date: payload.date,
      time: payload.time,
      partySize: payload.partySize,
      guestName: payload.guest.name,
      guestPhone: payload.guest.phone,
      specialRequests: payload.note ?? undefined,
    });
    return publicBooking(created.reservation);
  }

  const record = {
    reference: `SW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    venueSlug: venue.slug,
    venueName: venue.name,
    date: payload.date,
    time: payload.time,
    partySize: payload.partySize,
    zone: payload.zone ?? null,
    // Prepaid experiences confirm instantly; a free table at a busy venue is
    // pending until the host accepts it.
    status: venue.type === 'experience' || venue.demand < 0.75 ? 'CONFIRMED' : 'PENDING',
    guest: payload.guest,
    note: payload.note ?? null,
    prepaidPaise: venue.prepaid ?? null,
    createdAt: new Date().toISOString(),
  };

  store.write(BOOKINGS_KEY, [record, ...readBookings()]);
  return publicBooking(record);
}

export async function getBooking(reference) {
  await delay(180);
  const found = readBookings().find((b) => b.reference === reference);
  if (!found) throw new ServiceError('No booking with that reference.', { code: 'NOT_FOUND' });
  return publicBooking(found);
}

export async function cancelBooking(reference) {
  await delay(420);

  if (LIVE_API) {
    await reservationApi.cancel(reference);
    return getBooking(reference);
  }

  const next = readBookings().map((b) =>
    b.reference === reference ? { ...b, status: 'CANCELLED' } : b,
  );
  store.write(BOOKINGS_KEY, next);
  return publicBooking(next.find((b) => b.reference === reference));
}

/* ───────────────────────────────────────────────────────────── waitlist ── */

/**
 * The quote is computed, not invented: free tables are packed against the parties
 * already waiting, and this party's place in that packing sets the wait. Same
 * algorithm the host floor runs — a guest and a host seeing different numbers is
 * how trust in a waitlist dies.
 */
export async function joinWaitlist({ venueSlug, partySize, zone = null }) {
  await delay(480);

  const venue = getVenue(venueSlug);
  if (!venue) throw new ServiceError('Restaurant not found.', { code: 'NOT_FOUND' });

  if (LIVE_API) return waitlistApi.join({ restaurantSlug: venueSlug, partySize, zone });

  const ahead = waitlistFor(venue, todayISO());
  const floor = floorState(venue, todayISO());
  const free = floor.filter((t) => t.status === 'free');

  const me = { id: 'me', partySize, zone, priority: 0 };
  const plan = assignTables(free, [...ahead, me]);
  const seatedNow = plan.assignments.some((a) => a.party.id === 'me');

  const nextFit = floor
    .filter((t) => t.status !== 'free' && t.seats >= partySize)
    .sort((a, b) => a.turnsInMinutes - b.turnsInMinutes)[0];

  return {
    venue: { slug: venue.slug, name: venue.name },
    partySize,
    position: seatedNow ? 0 : ahead.filter((p) => p.partySize >= partySize).length + 1,
    quotedMinutes: seatedNow ? 0 : Math.max(10, nextFit?.turnsInMinutes ?? 45),
    ahead: ahead.length,
    seatedNow,
  };
}
