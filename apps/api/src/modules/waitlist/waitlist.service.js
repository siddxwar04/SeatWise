import { BadRequestError } from '../../errors/AppError.js';
import { sendWaitlistAvailable } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { serviceDateFor } from '../../lib/slots.js';
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
