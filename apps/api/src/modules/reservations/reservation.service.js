import { NotFoundError } from '../../errors/AppError.js';
import { prisma } from '../../lib/prisma.js';
import { normaliseReference } from '../../lib/reference.js';
import { utcToLocalParts } from '../../lib/slots.js';
import { isRestaurantAdmin } from '../restaurants/restaurant.service.js';

/**
 * Shapes a reservation row for the client.
 *
 * Times go out as both the raw UTC instant and pre-formatted local strings, so
 * the browser never has to reimplement the restaurant's timezone rules and
 * cannot drift from the server's idea of when a booking is.
 */
export function toPublicReservation(reservation) {
  const local = utcToLocalParts(reservation.startsAt);
  return {
    id: reservation.id,
    reference: reservation.reference,
    guestName: reservation.guestName,
    guestPhone: reservation.guestPhone,
    partySize: reservation.partySize,
    date: local.date,
    time: local.time,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    status: reservation.status,
    channel: reservation.channel,
    specialRequests: reservation.specialRequests,
    restaurantId: reservation.table?.restaurantId ?? null,
    table: reservation.table
      ? { label: reservation.table.label, zone: reservation.table.zone }
      : null,
    createdAt: reservation.createdAt,
    version: reservation.version,
  };
}

const PUBLIC_INCLUDE = {
  table: { select: { label: true, zone: true, capacity: true, restaurantId: true } },
};

/**
 * "My Reservations" — the page the audit noted was entirely missing. A guest
 * who booked previously had no record of it anywhere.
 *
 * Optional restaurantId filters to one venue; without it the guest sees every
 * booking they own across locations (that is intentional — "my bookings" is
 * user-scoped, not venue-scoped).
 */
export async function listForUser(userId, options) {
  const where = { userId };

  if (options.restaurantId) {
    where.table = { restaurantId: options.restaurantId };
  }
  if (options.status) {
    where.status = options.status;
  }
  if (options.upcoming) {
    where.startsAt = { gte: new Date() };
    where.status = where.status ?? { in: ['PENDING', 'CONFIRMED', 'SEATED'] };
  }

  const [rows, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      include: PUBLIC_INCLUDE,
      orderBy: { startsAt: options.upcoming ? 'asc' : 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.reservation.count({ where }),
  ]);

  return {
    reservations: rows.map(toPublicReservation),
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    },
  };
}

export async function getById(reservationId, actor) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: PUBLIC_INCLUDE,
  });

  const isOwner = reservation?.userId && reservation.userId === actor?.id;
  let isAdmin = actor?.role === 'ADMIN';

  if (!isAdmin && actor?.id && reservation?.table?.restaurantId) {
    isAdmin = await isRestaurantAdmin(actor.id, reservation.table.restaurantId, actor.role);
  }

  // A booking that exists but belongs to someone else returns exactly the
  // same 404 as one that does not exist. Distinguishing them would let an
  // attacker enumerate valid reservation ids.
  if (!reservation || (!isOwner && !isAdmin)) {
    throw new NotFoundError('Reservation not found.');
  }

  return toPublicReservation(reservation);
}

/**
 * Public lookup by reference + phone number.
 *
 * Guest bookings have no account behind them, so the reference alone would be
 * the only credential — and references appear in emails and on screens. Pairing
 * it with the phone number on the booking means a leaked reference is not
 * enough on its own.
 */
export async function findByReference(referenceInput, phoneInput) {
  const reference = normaliseReference(referenceInput);
  const phone = String(phoneInput).replace(/\D/g, '').slice(-10);

  const reservation = await prisma.reservation.findUnique({
    where: { reference },
    include: PUBLIC_INCLUDE,
  });

  if (!reservation || reservation.guestPhone !== phone) {
    throw new NotFoundError('No booking found with that reference and phone number.');
  }

  return toPublicReservation(reservation);
}
