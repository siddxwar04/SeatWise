import { BadRequestError } from '../../errors/AppError.js';
import { prisma } from '../../lib/prisma.js';
import {
  bookingInterval,
  generateSlots,
  intervalsOverlap,
  serviceDateFor,
  validateBookingTime,
} from '../../lib/slots.js';
import { summariseOverbooking } from '../overbooking/overbooking.service.js';

const OCCUPYING_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'];

/**
 * Which slots on a given day can seat a party of N at one restaurant, and how
 * many tables are left in each.
 *
 * This is what makes the booking form honest. The legacy form let you submit
 * any date and time and only discovered a problem later — usually never, since
 * there was no capacity check at all.
 *
 * Cost: ONE query for the tables, ONE for the day's bookings, then the slot
 * grid is computed in memory. The naive alternative — a query per slot — would
 * be 22 round trips to answer a single page load.
 *
 * restaurantId is mandatory so the grid never mixes floor plans from two
 * venues (which would under- or over-report availability).
 */
export async function getDayAvailability(restaurantId, dateStr, partySize) {
  if (!restaurantId) {
    throw new BadRequestError('Restaurant is required.');
  }

  const [tables, bookings] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { restaurantId, isActive: true, capacity: { gte: partySize } },
      select: { id: true, label: true, capacity: true },
      orderBy: [{ capacity: 'asc' }, { label: 'asc' }],
    }),
    prisma.reservation.findMany({
      where: {
        restaurantId,
        serviceDate: serviceDateFor(dateStr),
        status: { in: OCCUPYING_STATUSES },
      },
      select: {
        tableId: true,
        startsAt: true,
        endsAt: true,
        noShowRisk: true,
        isOverbooked: true,
      },
    }),
  ]);

  const bookingsByTable = new Map();
  for (const b of bookings) {
    if (!b.tableId) continue;
    const list = bookingsByTable.get(b.tableId);
    if (list) list.push(b);
    else bookingsByTable.set(b.tableId, [b]);
  }

  const now = new Date();

  const slots = generateSlots().map((time) => {
    const { startsAt, endsAt } = bookingInterval(dateStr, time);

    const rejection = validateBookingTime(dateStr, time, now);

    let tablesFree = 0;
    if (!rejection) {
      for (const table of tables) {
        const existing = bookingsByTable.get(table.id);
        const clash = existing?.some((b) =>
          intervalsOverlap(b.startsAt, b.endsAt, startsAt, endsAt),
        );
        if (!clash) tablesFree += 1;
      }
    }

    const overlapping = bookings.filter((b) =>
      intervalsOverlap(b.startsAt, b.endsAt, startsAt, endsAt),
    );
    const extra = summariseOverbooking(overlapping);
    const overbookingOpen = extra.remainingExtra > 0;
    const available = !rejection && (tablesFree > 0 || overbookingOpen);

    return {
      time,
      available,
      tablesFree,
      overbooking: extra,
      unavailableReason: rejection ?? (available ? null : 'Fully booked'),
    };
  });

  return {
    restaurantId,
    date: dateStr,
    partySize,
    totalTablesForPartySize: tables.length,
    slots,
    anyAvailable: slots.some((s) => s.available),
  };
}

/**
 * Compact availability across a date range — powers a calendar that greys out
 * full days before the guest picks one.
 */
export async function getRangeAvailability(restaurantId, startDate, days, partySize) {
  const results = [];
  const start = new Date(`${startDate}T00:00:00Z`);

  for (let i = 0; i < days; i += 1) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const dateStr = day.toISOString().slice(0, 10);
    const availability = await getDayAvailability(restaurantId, dateStr, partySize);
    results.push({
      date: dateStr,
      anyAvailable: availability.anyAvailable,
      slotsFree: availability.slots.filter((s) => s.available).length,
    });
  }

  return results;
}
