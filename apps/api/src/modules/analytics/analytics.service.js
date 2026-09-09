import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { generateSlots, utcToLocalParts } from '../../lib/slots.js';
import { listManagedRestaurants } from '../restaurants/restaurant.service.js';

/** Rough average spend (paise) per cover, keyed on restaurant.priceLevel 1–4.
 *  Exported — the risk queue (gap 7) reuses this same table for exposurePaise
 *  rather than maintaining a second pricing assumption. */
export const SPEND_PER_COVER_PAISE = {
  1: 40_000,
  2: 80_000,
  3: 150_000,
  4: 250_000,
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hoursFromSlots() {
  const hours = [...new Set(generateSlots().map((t) => t.slice(0, 2)))];
  return hours.sort();
}

const LEAD_TIME_BUCKETS = [
  { label: 'Same day', maxHours: 24 },
  { label: '1–3 days', maxHours: 24 * 3 },
  { label: '4–7 days', maxHours: 24 * 7 },
  { label: '1–4 weeks', maxHours: 24 * 28 },
  { label: '1+ month', maxHours: Infinity },
];

const PARTY_SIZE_BUCKETS = [
  { label: '1–2', max: 2 },
  { label: '3–4', max: 4 },
  { label: '5–6', max: 6 },
  { label: '7+', max: Infinity },
];

/**
 * No-show rate per bucket, over *settled* bookings only (COMPLETED or
 * NO_SHOW) — an upcoming PENDING booking has no outcome yet, and mixing it in
 * would just dilute every rate toward zero.
 */
function bucketRates(settled, buckets, valueOf) {
  const counts = buckets.map(() => ({ total: 0, noShows: 0 }));

  for (const booking of settled) {
    const value = valueOf(booking);
    const index = buckets.findIndex((b) => value <= (b.maxHours ?? b.max));
    const bucket = counts[index === -1 ? buckets.length - 1 : index];
    bucket.total += 1;
    if (booking.status === 'NO_SHOW') bucket.noShows += 1;
  }

  return buckets.map((b, i) => ({
    bucket: b.label,
    count: counts[i].total,
    rate: counts[i].total === 0 ? 0 : counts[i].noShows / counts[i].total,
  }));
}

function confirmationBreakdown(settled) {
  const completed = settled.filter((b) => b.status === 'COMPLETED').length;
  const noShows = settled.filter((b) => b.status === 'NO_SHOW').length;
  const total = completed + noShows;
  return [
    { bucket: 'Completed', count: completed, rate: total === 0 ? 0 : completed / total },
    { bucket: 'No-show', count: noShows, rate: total === 0 ? 0 : noShows / total },
  ];
}

/**
 * Owner analytics: occupancy, revenue per table-hour, no-show heatmap.
 *
 * Computed live — no snapshot table. Restaurant scale (weeks of bookings,
 * dozens of tables) is a few aggregations, not a warehouse job.
 */
export async function getAnalytics(restaurantId, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const durationHours = env.DINING_DURATION_MINUTES / 60;
  const operatingHours = Math.max(1, env.RESTAURANT_CLOSE_HOUR - env.RESTAURANT_OPEN_HOUR);

  const [restaurant, tables, bookings] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { priceLevel: true },
    }),
    prisma.restaurantTable.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, capacity: true },
    }),
    prisma.reservation.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      select: { startsAt: true, partySize: true, status: true, createdAt: true },
    }),
  ]);

  const tableCount = tables.length || 1;
  const availableTableHours = tableCount * operatingHours * days;

  const occupied = bookings.filter((b) =>
    ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'].includes(b.status),
  );
  const occupiedTableHours = occupied.length * durationHours;
  const occupancyRate = Number(Math.min(1, occupiedTableHours / availableTableHours).toFixed(3));

  const settledCovers = bookings
    .filter((b) => b.status === 'COMPLETED' || b.status === 'SEATED')
    .reduce((sum, b) => sum + b.partySize, 0);
  const spend = SPEND_PER_COVER_PAISE[restaurant?.priceLevel ?? 2] ?? SPEND_PER_COVER_PAISE[2];
  const revenuePaise = settledCovers * spend;
  const revenuePerTableHourPaise =
    availableTableHours === 0 ? 0 : Math.round(revenuePaise / availableTableHours);

  const hours = hoursFromSlots();
  const heatmap = WEEKDAYS.map((day, dayIndex) => ({
    day,
    dayIndex,
    cells: hours.map((hour) => ({ hour, bookings: 0, noShows: 0 })),
  }));

  for (const booking of bookings) {
    const local = utcToLocalParts(booking.startsAt);
    const hour = String(local.hour).padStart(2, '0');
    const row = heatmap[local.dayOfWeek];
    const cell = row.cells.find((c) => c.hour === hour);
    if (!cell) continue;
    cell.bookings += 1;
    if (booking.status === 'NO_SHOW') cell.noShows += 1;
  }

  for (const row of heatmap) {
    for (const cell of row.cells) {
      cell.rate = cell.bookings === 0 ? 0 : cell.noShows / cell.bookings;
    }
  }

  const noShows = bookings.filter((b) => b.status === 'NO_SHOW');
  const completedOrNoShow = bookings.filter(
    (b) => b.status === 'COMPLETED' || b.status === 'NO_SHOW',
  );
  // Covers that walked out the door empty — the revenue the no-show model
  // exists to help an owner claw back via overbooking.
  const lostCovers = noShows.reduce((sum, b) => sum + b.partySize, 0);

  return {
    restaurantId,
    periodDays: days,
    occupancyRate,
    occupancyPercent: Number((occupancyRate * 100).toFixed(1)),
    availableTableHours: Number(availableTableHours.toFixed(1)),
    occupiedTableHours: Number(occupiedTableHours.toFixed(1)),
    covers: settledCovers,
    estimatedSpendPerCoverPaise: spend,
    revenuePaise,
    revenuePerTableHourPaise,
    noShowCount: noShows.length,
    lostRevenuePaise: lostCovers * spend,
    noShowRate:
      completedOrNoShow.length === 0
        ? null
        : Number(((noShows.length / completedOrNoShow.length) * 100).toFixed(1)),
    heatmap,
    hours,
    /** Which lever to pull, not just the aggregate rate — see AnalyticsPanel. */
    byLeadTime: bucketRates(
      completedOrNoShow,
      LEAD_TIME_BUCKETS,
      (b) => (b.startsAt.getTime() - b.createdAt.getTime()) / 3_600_000,
    ),
    byPartySize: bucketRates(completedOrNoShow, PARTY_SIZE_BUCKETS, (b) => b.partySize),
    byConfirmation: confirmationBreakdown(completedOrNoShow),
  };
}

/** low < 10% · medium < 20% · high ≥ 20% — matches the bands the owner console's RiskPanel uses. */
export function riskBand(noShowRatePercent) {
  if (noShowRatePercent == null) return 'unknown';
  if (noShowRatePercent >= 20) return 'high';
  if (noShowRatePercent >= 10) return 'medium';
  return 'low';
}

/**
 * Gap 5: the cross-venue rollup for an owner managing more than one
 * restaurant. Reuses getAnalytics per venue (no separate aggregation logic to
 * keep in sync) rather than a bespoke cross-venue query — fine at demo scale,
 * where "managed" means a handful of venues, not hundreds.
 */
export async function getPortfolioAnalytics(userId, role, days = 30) {
  const restaurants = await listManagedRestaurants(userId, role);

  const [rows, seatsByRestaurant, platformVenueCount] = await Promise.all([
    Promise.all(
      restaurants.map(async (restaurant) => {
        const analytics = await getAnalytics(restaurant.id, days);
        return {
          restaurant: {
            id: restaurant.id,
            slug: restaurant.slug,
            name: restaurant.name,
            city: restaurant.city,
            area: restaurant.area,
          },
          ...analytics,
          band: riskBand(analytics.noShowRate),
        };
      }),
    ),
    prisma.restaurantTable.groupBy({
      by: ['restaurantId'],
      where: { restaurantId: { in: restaurants.map((r) => r.id) }, isActive: true },
      _sum: { capacity: true },
    }),
    // "Everything on the platform", not just what this owner manages — the
    // network-scale framing the frontend fixture's `platform.venues` shows.
    prisma.restaurant.count({ where: { isActive: true } }),
  ]);

  const seatsById = new Map(seatsByRestaurant.map((s) => [s.restaurantId, s._sum.capacity ?? 0]));
  const totalSeats = rows.reduce((sum, r) => sum + (seatsById.get(r.restaurant.id) ?? 0), 0);

  const worstVenue = rows.length
    ? [...rows].sort((a, b) => (b.noShowRate ?? -1) - (a.noShowRate ?? -1))[0]
    : null;

  return {
    periodDays: days,
    rows,
    totals: {
      venues: rows.length,
      seats: totalSeats,
      lostRevenuePaise: rows.reduce((sum, r) => sum + r.lostRevenuePaise, 0),
      worstVenue,
    },
    platform: { venues: platformVenueCount },
  };
}
