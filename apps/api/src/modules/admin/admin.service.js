import { BadRequestError, ConflictError, NotFoundError } from '../../errors/AppError.js';
import { CACHE_KEYS, invalidatePrefix } from '../../lib/cache.js';
import { sendHighRiskReminder } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { serviceDateFor, todayLocal, utcToLocalParts } from '../../lib/slots.js';
import { setTenantGuc } from '../../lib/tenant.js';
import { SPEND_PER_COVER_PAISE } from '../analytics/analytics.service.js';
import { selectBestFitTable } from '../assignment/tableAssignment.service.js';
import { riskFeaturesFor } from '../reservations/booking.service.js';
import { toPublicReservation } from '../reservations/reservation.service.js';
import { riskLevel, scoreReservation } from '../risk/riskScoring.service.js';
import { notifyMatchingWaitlist } from '../waitlist/waitlist.service.js';

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
  return { restaurantId };
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
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        table: {
          select: { label: true, zone: true, capacity: true, restaurantId: true },
        },
      },
    });
    if (!current) throw new NotFoundError('Reservation not found.');

    const tenantId = current.restaurantId;
    if (restaurantId && tenantId !== restaurantId) {
      throw new NotFoundError('Reservation not found.');
    }

    await setTenantGuc(tx, tenantId);

    if (current.status === nextStatus) return { row: current, changed: false };

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

    let tableId = current.tableId;
    let scored = {};

    if (nextStatus === 'CONFIRMED') {
      let priorBookings = 0;
      let priorNoShows = 0;
      if (current.userId) {
        const guest = await tx.user.findUnique({
          where: { id: current.userId },
          select: { priorBookings: true, priorNoShows: true },
        });
        priorBookings = guest?.priorBookings ?? 0;
        priorNoShows = guest?.priorNoShows ?? 0;
      }
      scored = scoreReservation(
        riskFeaturesFor({
          startsAt: current.startsAt,
          partySize: current.partySize,
          status: 'CONFIRMED',
          priorBookings,
          priorNoShows,
        }),
      );
    }

    if (nextStatus === 'SEATED' && !tableId) {
      const local = utcToLocalParts(current.startsAt);
      const locked = await tx.$queryRaw`
        SELECT id, label, capacity
        FROM restaurant_tables
        WHERE restaurant_id = ${tenantId}::uuid
          AND is_active = true
          AND capacity >= ${current.partySize}
        ORDER BY id
        FOR UPDATE
      `;
      const clashes = await tx.reservation.findMany({
        where: {
          restaurantId: tenantId,
          status: { in: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'] },
          startsAt: { lt: current.endsAt },
          endsAt: { gt: current.startsAt },
          tableId: { not: null },
          id: { not: current.id },
        },
        select: { tableId: true },
      });
      const busy = new Set(clashes.map((c) => c.tableId));
      const pick = selectBestFitTable(locked, busy);
      if (pick) tableId = pick.id;
      else logger.warn({ reservationId, time: local.time }, 'seated overbook with no free table');
    }

    const row = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: nextStatus,
        version: { increment: 1 },
        tableId,
        ...(nextStatus === 'SEATED' ? { seatedAt: new Date() } : {}),
        ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        ...(scored.noShowRisk != null
          ? { noShowRisk: scored.noShowRisk, riskModelVersion: scored.riskModelVersion }
          : {}),
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

    return { row, changed: true, previous: current };
  });

  const tenantId = updated.row.restaurantId;
  if (updated.changed && tenantId) {
    await invalidatePrefix(CACHE_KEYS.overbookingPrefix(tenantId));
  }

  if (
    updated.changed &&
    (nextStatus === 'CANCELLED' || nextStatus === 'NO_SHOW') &&
    tenantId
  ) {
    try {
      const local = utcToLocalParts(updated.row.startsAt);
      await notifyMatchingWaitlist({
        restaurantId: tenantId,
        date: local.date,
        time: local.time,
        partySize: updated.row.partySize,
      });
    } catch (err) {
      logger.error({ err, reservationId }, 'waitlist notify after status change failed');
    }
  }

  return updated.row;
}

/** Owner-triggered reminder for high no-show-risk bookings. */
export async function sendReminder(reservationId, restaurantId) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      table: { select: { restaurantId: true } },
      user: { select: { email: true } },
    },
  });

  if (!reservation || reservation.restaurantId !== restaurantId) {
    throw new NotFoundError('Reservation not found.');
  }

  if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
    throw new BadRequestError('Reminders can only be sent for upcoming bookings.');
  }

  const to = reservation.guestEmail || reservation.user?.email;
  if (!to) {
    throw new BadRequestError('This booking has no email address on file.');
  }

  const local = utcToLocalParts(reservation.startsAt);
  const venue = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true },
  });

  const result = await sendHighRiskReminder({
    to,
    guestName: reservation.guestName,
    restaurantName: venue?.name || 'TastyFood',
    date: local.date,
    time: local.time,
    partySize: reservation.partySize,
    reference: reservation.reference,
  });

  if (!result.ok) {
    if (result.reason === 'not_configured') {
      throw new BadRequestError('Email is not configured. Set RESEND_API_KEY on the API.');
    }
    if (result.reason === 'no_recipient') {
      throw new BadRequestError('This booking has no email address on file.');
    }
    throw new BadRequestError('Could not send the reminder email. Please try again.');
  }

  return { message: `Reminder sent to ${to}.` };
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

const FLOOR_OCCUPYING_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED'];

/**
 * Gap 6: a snapshot of every table's status right now — free / seated /
 * turning soon — for the owner console's floor view. Reporting, not
 * planning: unlike selectBestFitTable (which decides where a NEW party
 * should sit), this just reads which reservations currently overlap `at` and
 * reflects that back per table.
 */
export async function getFloorState(restaurantId, at = new Date()) {
  requireRestaurantScope(restaurantId);

  const [tables, active] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, label: true, capacity: true, zone: true, combinable: true, combineGroup: true },
      orderBy: { label: 'asc' },
    }),
    prisma.reservation.findMany({
      where: {
        restaurantId,
        startsAt: { lte: at },
        endsAt: { gt: at },
        status: { in: FLOOR_OCCUPYING_STATUSES },
      },
      select: { tableId: true, partySize: true, guestName: true, startsAt: true, endsAt: true },
    }),
  ]);

  const byTable = new Map(active.filter((r) => r.tableId).map((r) => [r.tableId, r]));

  return tables.map((table) => {
    const reservation = byTable.get(table.id);
    if (!reservation) {
      return {
        ...table,
        status: 'free',
        partySize: 0,
        guestName: null,
        minutesIn: 0,
        turnsInMinutes: 0,
        turnsAt: null,
      };
    }

    const minutesIn = Math.round((at.getTime() - reservation.startsAt.getTime()) / 60_000);
    const turnsInMinutes = Math.round((reservation.endsAt.getTime() - at.getTime()) / 60_000);

    return {
      ...table,
      // Same 15-minute "about to turn" threshold the frontend fixture uses.
      status: turnsInMinutes <= 15 ? 'turning' : 'seated',
      partySize: reservation.partySize,
      guestName: reservation.guestName,
      minutesIn,
      turnsInMinutes,
      turnsAt: utcToLocalParts(reservation.endsAt).time,
    };
  });
}

/**
 * Gap 7: what a host should act on tonight, most urgent first. A thin
 * reshape of Reservation.noShowRisk (already scored at booking time by
 * scoreReservation — see booking.service.js) into bands + a suggested
 * action. No new modeling.
 */
export async function getRiskQueue(restaurantId, dateStr) {
  requireRestaurantScope(restaurantId);

  const [reservations, restaurant] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        restaurantId,
        serviceDate: serviceDateFor(dateStr),
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: {
        id: true,
        reference: true,
        guestName: true,
        guestPhone: true,
        partySize: true,
        startsAt: true,
        status: true,
        noShowRisk: true,
        riskModelVersion: true,
      },
      orderBy: { noShowRisk: 'desc' },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { priceLevel: true } }),
  ]);

  const spend = SPEND_PER_COVER_PAISE[restaurant?.priceLevel ?? 2] ?? SPEND_PER_COVER_PAISE[2];

  const queue = reservations.map((reservation) => {
    const band = riskLevel(reservation.noShowRisk);
    // Bands exist to trigger exactly these three actions — a confirmed guest
    // who is still high-risk gets a call, not another reminder they already
    // acted on once.
    const action =
      band === 'high'
        ? reservation.status === 'CONFIRMED'
          ? 'call'
          : 'remind'
        : band === 'medium'
          ? 'remind'
          : 'none';

    return {
      ...reservation,
      band,
      action,
      exposurePaise: Math.round((reservation.noShowRisk ?? 0) * reservation.partySize * spend),
    };
  });

  const bands = ['high', 'medium', 'low'].map((band) => ({
    band,
    count: queue.filter((r) => r.band === band).length,
    covers: queue.filter((r) => r.band === band).reduce((sum, r) => sum + r.partySize, 0),
  }));

  return { restaurantId, date: dateStr, queue, bands };
}
