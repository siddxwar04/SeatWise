import { BadRequestError, ConflictError, NotFoundError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { serviceDateFor, todayLocal, utcToLocalParts } from '../../lib/slots.js';
import { toPublicReservation } from '../reservations/reservation.service.js';

/**
 * The admin surface the audit found entirely missing: "Bookings go into the DB
 * and are unreadable except via phpMyAdmin."
 *
 * Every list/stats query requires restaurantId so a restaurant admin never
 * sees another venue's book, and a global ADMIN must still pick a venue
 * (or pass restaurantId) rather than accidentally aggregating the whole fleet.
 */

/**
 * Legal status transitions.
 *
 * Encoding this as a map rather than scattering `if` statements means an
 * invalid move (COMPLETED -> PENDING) is rejected in one place, and the rules
 * are readable at a glance.
 */
const ALLOWED_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function requireRestaurantScope(restaurantId) {
  if (!restaurantId) {
    throw new BadRequestError('restaurantId is required for admin queries.');
  }
  return { table: { restaurantId } };
}

export async function listReservations(filters) {
  const where = {
    ...requireRestaurantScope(filters.restaurantId),
  };

  if (filters.status) where.status = filters.status;
  if (filters.date) where.serviceDate = serviceDateFor(filters.date);
  if (filters.search) {
    // Booking reference, guest name, or phone — whatever the person on the
    // phone happens to give you.
    where.OR = [
      { reference: { contains: filters.search.toUpperCase() } },
      { guestName: { contains: filters.search, mode: 'insensitive' } },
      { guestPhone: { contains: filters.search.replace(/\D/g, '') } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      include: {
        table: { select: { label: true, zone: true, capacity: true, restaurantId: true } },
        user: { select: { id: true, email: true, priorNoShows: true, priorBookings: true } },
      },
      orderBy: { startsAt: filters.sort === 'oldest' ? 'asc' : 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.reservation.count({ where }),
  ]);

  return {
    reservations: rows.map((r) => ({
      ...toPublicReservation(r),
      guestEmail: r.guestEmail,
      noShowRisk: r.noShowRisk,
      isOverbooked: r.isOverbooked,
      account: r.user
        ? {
            email: r.user.email,
            priorBookings: r.user.priorBookings,
            priorNoShows: r.user.priorNoShows,
          }
        : null,
    })),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  };
}

/**
 * Status change with optimistic locking.
 *
 * Contention is low — two managers rarely touch the same booking in the same
 * second — so a version check that fails occasionally and asks for a refresh
 * is cheaper than holding a row lock across the request. This is the deliberate
 * counterpart to the pessimistic locking in the booking engine, and the
 * difference between them is exactly the contention level.
 *
 * restaurantId (when provided) ensures a restaurant admin cannot mutate a
 * booking that belongs to another venue even if they guess the UUID.
 */
export async function updateStatus(
  reservationId,
  nextStatus,
  expectedVersion,
  adminId,
  restaurantId,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        table: {
          select: { label: true, zone: true, capacity: true, restaurantId: true },
        },
      },
    });
    if (!current) throw new NotFoundError('Reservation not found.');

    if (restaurantId && current.table?.restaurantId !== restaurantId) {
      throw new NotFoundError('Reservation not found.');
    }

    if (current.status === nextStatus) return current;

    const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestError(
        `A ${current.status.toLowerCase()} booking cannot be moved to ${nextStatus.toLowerCase()}.`,
      );
    }

    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new ConflictError(
        'Someone else updated this booking while you were viewing it. Refresh and try again.',
      );
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: nextStatus,
        version: { increment: 1 },
        ...(nextStatus === 'SEATED' ? { seatedAt: new Date() } : {}),
        ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
      include: {
        table: {
          select: { label: true, zone: true, capacity: true, restaurantId: true },
        },
      },
    });

    /**
     * A no-show updates the guest's counter in the same transaction. That
     * counter is a direct input to the risk model, so it must never drift
     * from the reservation rows it summarises.
     */
    if (nextStatus === 'NO_SHOW' && current.userId) {
      await tx.user.update({
        where: { id: current.userId },
        data: { priorNoShows: { increment: 1 } },
      });
    }

    logger.info(
      { reservationId, from: current.status, to: nextStatus, adminId },
      'reservation status changed',
    );

    return updated;
  });
}

/**
 * Today's service view — what the front-of-house actually needs on a screen.
 */
export async function getTodayService(restaurantId) {
  const scope = requireRestaurantScope(restaurantId);
  const today = todayLocal();

  const reservations = await prisma.reservation.findMany({
    where: {
      ...scope,
      serviceDate: serviceDateFor(today),
      status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
    },
    include: { table: { select: { label: true, zone: true, restaurantId: true } } },
    orderBy: { startsAt: 'asc' },
  });

  const covers = reservations.reduce((sum, r) => sum + r.partySize, 0);

  return {
    restaurantId,
    date: today,
    bookings: reservations.length,
    covers,
    highRisk: reservations.filter((r) => (r.noShowRisk ?? 0) >= 0.5).length,
    reservations: reservations.map((r) => ({
      ...toPublicReservation(r),
      noShowRisk: r.noShowRisk,
      isOverbooked: r.isOverbooked,
    })),
  };
}

/**
 * Dashboard metrics.
 *
 * groupBy rather than pulling rows into Node and counting them there — the
 * database is far better at aggregation, and this stays O(1) round trips as
 * the booking table grows.
 */
export async function getDashboardStats(restaurantId, days = 30) {
  const scope = requireRestaurantScope(restaurantId);
  const since = new Date(Date.now() - days * 86_400_000);
  const todayDate = serviceDateFor(todayLocal());

  const [statusCounts, totals, todayCount, upcomingCount, recentBookings, topTables] =
    await Promise.all([
      prisma.reservation.groupBy({
        by: ['status'],
        where: { ...scope, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.reservation.aggregate({
        where: { ...scope, createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { partySize: true, noShowRisk: true },
        _sum: { partySize: true },
      }),
      prisma.reservation.count({
        where: {
          ...scope,
          serviceDate: todayDate,
          status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
        },
      }),
      prisma.reservation.count({
        where: {
          ...scope,
          startsAt: { gte: new Date() },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
      prisma.reservation.findMany({
        where: { ...scope, createdAt: { gte: since } },
        select: { startsAt: true, partySize: true, status: true },
      }),
      prisma.reservation.groupBy({
        by: ['tableId'],
        where: { ...scope, createdAt: { gte: since }, tableId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { tableId: 'desc' } },
        take: 5,
      }),
    ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  const completed = byStatus.COMPLETED ?? 0;
  const noShows = byStatus.NO_SHOW ?? 0;
  const settled = completed + noShows;

  // Bookings per hour of day, and per weekday — the two charts that actually
  // tell a restaurant something.
  const byHour = {};
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const r of recentBookings) {
    const local = utcToLocalParts(r.startsAt);
    byHour[local.time] = (byHour[local.time] ?? 0) + 1;
    byWeekday[local.dayOfWeek] += 1;
  }

  return {
    restaurantId,
    periodDays: days,
    totals: {
      bookings: totals._count._all,
      covers: totals._sum.partySize ?? 0,
      averagePartySize: Number((totals._avg.partySize ?? 0).toFixed(1)),
      averageNoShowRisk:
        totals._avg.noShowRisk === null ? null : Number(totals._avg.noShowRisk.toFixed(3)),
    },
    today: todayCount,
    upcoming: upcomingCount,
    byStatus,
    noShowRate: settled === 0 ? null : Number(((noShows / settled) * 100).toFixed(1)),
    cancellationRate:
      totals._count._all === 0
        ? null
        : Number((((byStatus.CANCELLED ?? 0) / totals._count._all) * 100).toFixed(1)),
    bookingsByTime: Object.entries(byHour)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time)),
    bookingsByWeekday: byWeekday.map((count, index) => ({
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index],
      count,
    })),
    busiestTables: topTables.map((t) => ({ tableId: t.tableId, bookings: t._count._all })),
  };
}

export async function listTables(restaurantId) {
  requireRestaurantScope(restaurantId);
  return prisma.restaurantTable.findMany({
    where: { restaurantId },
    orderBy: [{ capacity: 'asc' }, { label: 'asc' }],
  });
}
