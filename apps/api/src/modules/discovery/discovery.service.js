import { prisma } from '../../lib/prisma.js';
import { todayLocal } from '../../lib/slots.js';
import { getDayAvailability } from '../reservations/availability.service.js';

/**
 * Cross-venue discovery — the SeatWise Discover page's real backing endpoint.
 *
 * Deliberately narrower than the frontend's fixture-mode `searchVenues()`
 * (services/marketplace.js) in one way: text search only matches name/
 * cuisine/area, not tagline/signatures (would need a slower OR-across-JSON
 * scan for little payoff at demo scale). `walkin` and `experience` quick
 * filters and the `rating` sort now work — gaps 3 and 4 landed the fields
 * they need. What IS here is real: availability comes from the same
 * getDayAvailability() the booking form uses, not a fixture slot string, so a
 * venue only shows as bookable if it actually has a free table (or open
 * overbooking headroom) for the requested party.
 */

const restaurantSelect = {
  id: true,
  slug: true,
  name: true,
  address: true,
  phone: true,
  cuisine: true,
  priceLevel: true,
  vibeTags: true,
  city: true,
  area: true,
  ratingAvg: true,
  ratingCount: true,
  tagline: true,
  curated: true,
  bookingType: true,
  walkIn: true,
};

function minutesOf(time) {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

function parseList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function matchesText(restaurant, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return [restaurant.name, restaurant.cuisine, restaurant.area].join(' ').toLowerCase().includes(needle);
}

const SORTERS = {
  // Soonest-to-the-requested-time first, then whichever venue has more open
  // slots that day. No paid placement — same principle as the frontend's
  // documented relevanceScore, just without the rating/curated/km terms this
  // schema cannot compute yet.
  relevance: (a, b) =>
    (a.availability.nearestSlot?.offset ?? Infinity) - (b.availability.nearestSlot?.offset ?? Infinity) ||
    b.availability.freeSlotCount - a.availability.freeSlotCount,
  availability: (a, b) => b.availability.freeSlotCount - a.availability.freeSlotCount,
  'price-asc': (a, b) => a.priceLevel - b.priceLevel,
  'price-desc': (a, b) => b.priceLevel - a.priceLevel,
  // Unrated venues (ratingCount 0) sink to the bottom rather than outranking
  // a genuinely 5-star venue by tiebreak on an empty average of 0.
  rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
};

/**
 * One query for the candidate restaurants, then one availability lookup per
 * candidate (2 queries each — see getDayAvailability). Fine at demo scale
 * (a handful of venues per city); a city with hundreds of venues would need a
 * denormalised availability cache instead of N lookups, which is out of scope
 * here.
 */
export async function discoverRestaurants(query) {
  const {
    city,
    date = todayLocal(),
    time = '19:30',
    party = 2,
    cuisine,
    price,
    area,
    q,
    quick,
    sort = 'relevance',
  } = query;

  const cuisines = parseList(cuisine);
  const prices = parseList(price).map(Number);
  const areas = parseList(area);
  const quickFilters = parseList(quick);
  const needsTableShape = quickFilters.includes('outdoor') || quickFilters.includes('group');
  const target = minutesOf(time);

  const candidates = await prisma.restaurant.findMany({
    where: {
      isActive: true,
      city,
      ...(cuisines.length ? { cuisine: { in: cuisines } } : {}),
      ...(prices.length ? { priceLevel: { in: prices } } : {}),
      ...(areas.length ? { area: { in: areas } } : {}),
    },
    select: restaurantSelect,
    orderBy: { name: 'asc' },
  });

  const withAvailability = await Promise.all(
    candidates.filter((r) => matchesText(r, q)).map(async (restaurant) => {
      const [dayAvailability, tables] = await Promise.all([
        getDayAvailability(restaurant.id, date, party),
        needsTableShape
          ? prisma.restaurantTable.findMany({
              where: { restaurantId: restaurant.id, isActive: true },
              select: { zone: true, capacity: true },
            })
          : Promise.resolve([]),
      ]);

      const openSlots = dayAvailability.slots.filter((s) => s.available);
      const nearestSlot = openSlots.length
        ? openSlots
            .map((s) => ({ time: s.time, offset: Math.abs(minutesOf(s.time) - target) }))
            .sort((a, b) => a.offset - b.offset)[0]
        : null;

      return {
        ...restaurant,
        availability: {
          anyAvailable: dayAvailability.anyAvailable,
          freeSlotCount: openSlots.length,
          nearestSlot,
        },
        outdoorCapable: tables.some((t) => t.zone === 'OUTDOOR'),
        maxTableCapacity: tables.reduce((max, t) => Math.max(max, t.capacity), 0),
      };
    }),
  );

  const isToday = date === todayLocal();

  const results = withAvailability
    .filter((r) => {
      // A discovery list only makes sense showing venues that can actually
      // seat this party at this date — a greyed-out card with no slots is
      // the fixture UI's job (it shows "fully booked"), not this endpoint's.
      if (!r.availability.anyAvailable) return false;
      for (const filter of quickFilters) {
        if (filter === 'tonight' && !isToday) return false;
        if (filter === 'outdoor' && !r.outdoorCapable) return false;
        if (filter === 'group' && r.maxTableCapacity < 6) return false;
        if (filter === 'walkin' && !r.walkIn) return false;
        if (filter === 'experience' && r.bookingType !== 'EXPERIENCE') return false;
      }
      return true;
    })
    .sort(SORTERS[sort] ?? SORTERS.relevance)
    .map(({ outdoorCapable, maxTableCapacity, ...restaurant }) => restaurant);

  return {
    city,
    date,
    time,
    party,
    total: results.length,
    restaurants: results,
  };
}
