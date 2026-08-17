import { BadRequestError } from '../../errors/AppError.js';
import { sendWaitlistAvailable } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { bookingInterval, serviceDateFor } from '../../lib/slots.js';
import { assignPartiesToTables } from '../assignment/tableAssignment.service.js';
import { resolveRestaurant } from '../restaurants/restaurant.service.js';

function toPublic(entry) {
  return {
    id: entry.id,
    restaurantId: entry.restaurantId,
    guestName: entry.guestName,
    guestPhone: entry.guestPhone,
    guestEmail: entry.guestEmail,
    date: entry.requestedDate.toISOString().slice(0, 10),
    time: entry.requestedTime,
    partySize: entry.partySize,
    status: entry.status,
    notifiedAt: entry.notifiedAt,
    createdAt: entry.createdAt,
  };
}

export async function joinWaitlist(input, actor) {
  const venue = await resolveRestaurant({ restaurantSlug: input.restaurantSlug });
  const serviceDate = serviceDateFor(input.date);

  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      restaurantId: venue.id,
      status: 'WAITING',
      requestedDate: serviceDate,
      requestedTime: input.time,
      guestPhone: input.guestPhone,
    },
  });

  if (existing) {
    throw new BadRequestError('You are already on the waitlist for that slot.');
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      restaurantId: venue.id,
      userId: actor?.id ?? null,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      guestEmail: input.guestEmail ?? actor?.email ?? null,
      requestedDate: serviceDate,
      requestedTime: input.time,
      partySize: input.partySize,
      status: 'WAITING',
    },
  });

  logger.info(
    { waitlistId: entry.id, restaurantId: venue.id, date: input.date, time: input.time },
    'waitlist joined',
  );

  return { entry: toPublic(entry), message: 'You are on the waitlist. We will email you if a table opens.' };
}

/**
 * After cancel / no-show frees a slot, notify the oldest matching waitlist guest.
 */
export async function notifyMatchingWaitlist({ restaurantId, date, time, partySize }) {
  const serviceDate = typeof date === 'string' ? serviceDateFor(date) : date;

  const match = await prisma.waitlistEntry.findFirst({
    where: {
      restaurantId,
      status: 'WAITING',
      requestedDate: serviceDate,
      requestedTime: time,
      partySize: { lte: partySize },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      restaurant: { select: { name: true, slug: true } },
      user: { select: { email: true } },
    },
  });

  if (!match) return null;

  const updated = await prisma.waitlistEntry.update({
    where: { id: match.id },
    data: { status: 'NOTIFIED', notifiedAt: new Date() },
  });

  const to = match.guestEmail || match.user?.email;
  await sendWaitlistAvailable({
    to,
    guestName: match.guestName,
    restaurantName: match.restaurant.name,
    restaurantSlug: match.restaurant.slug,
    date: match.requestedDate.toISOString().slice(0, 10),
    time: match.requestedTime,
    partySize: match.partySize,
  });

  logger.info({ waitlistId: match.id, restaurantId }, 'waitlist guest notified');
  return toPublic(updated);
}

export async function listWaitlist(restaurantId, { status } = {}) {
  const rows = await prisma.waitlistEntry.findMany({
    where: {
      restaurantId,
      ...(status ? { status } : { status: { in: ['WAITING', 'NOTIFIED'] } }),
    },
    orderBy: [{ requestedDate: 'asc' }, { requestedTime: 'asc' }, { createdAt: 'asc' }],
  });

  return { entries: rows.map(toPublic) };
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function publicAssignment(assignment) {
  return {
    party: toPublic(assignment.party),
    tables: assignment.tables,
    wastedSeats: assignment.wastedSeats,
    combined: assignment.combined,
    applyable: !assignment.combined,
  };
}

/**
 * Best-fit (and combinable-pair) suggestions for waiting parties.
 * Groups by requested slot so a Friday 20:00 queue does not steal Saturday tables.
 */
export async function planWaitlistAssignments(restaurantId, { date, time } = {}) {
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      restaurantId,
      status: 'WAITING',
      ...(date ? { requestedDate: serviceDateFor(date) } : {}),
      ...(time ? { requestedTime: time } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId, isActive: true },
  });

  const groups = new Map();
  for (const entry of entries) {
    const key = `${isoDate(entry.requestedDate)}|${entry.requestedTime}`;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const slots = [];
  for (const [key, parties] of groups) {
    const [slotDate, slotTime] = key.split('|');
    const { startsAt, endsAt } = bookingInterval(slotDate, slotTime);
    const occupying = await prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        tableId: { not: null },
      },
      select: { tableId: true },
    });
    const busy = new Set(occupying.map((r) => r.tableId));
    const result = assignPartiesToTables(tables, parties, busy);
    slots.push({
      date: slotDate,
      time: slotTime,
      assignments: result.assignments.map(publicAssignment),
      unassigned: result.unassigned.map(toPublic),
    });
  }

  return { slots };
}

/**
 * Convert applyable (single-table) suggestions into real bookings.
 * Combined-table suggestions stay as suggestions — one reservation row cannot
 * occupy two table_ids under the exclusion constraint.
 */
export async function applyWaitlistAssignments(restaurantId, options = {}) {
  const plan = await planWaitlistAssignments(restaurantId, options);
  const { createReservation } = await import('../reservations/booking.service.js');
  const created = [];
  const skipped = [];

  for (const slot of plan.slots) {
    for (const assignment of slot.assignments) {
      if (!assignment.applyable) {
        skipped.push({ party: assignment.party, reason: 'combined_needs_staff' });
        continue;
      }
      try {
        const reservation = await createReservation(
          {
            restaurantId,
            tableId: assignment.tables[0].id,
            guestName: assignment.party.guestName,
            guestPhone: assignment.party.guestPhone,
            guestEmail: assignment.party.guestEmail,
            partySize: assignment.party.partySize,
            date: slot.date,
            time: slot.time,
          },
          null,
          'WALK_IN',
        );
        await prisma.waitlistEntry.update({
          where: { id: assignment.party.id },
          data: { status: 'CONVERTED' },
        });
        created.push({ partyId: assignment.party.id, reference: reservation.reference });
      } catch (err) {
        skipped.push({ party: assignment.party, reason: err.message });
      }
    }
  }

  return { created, skipped, plan };
}
