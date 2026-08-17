import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { BadRequestError, ConflictError } from '../../errors/AppError.js';
import { CACHE_KEYS, invalidatePrefix } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { generateBookingReference } from '../../lib/reference.js';
import { bookingInterval, serviceDateFor, utcToLocalParts, validateBookingTime } from '../../lib/slots.js';
import { setTenantGuc } from '../../lib/tenant.js';
import { selectBestFitTable } from '../assignment/tableAssignment.service.js';
import { summariseOverbooking } from '../overbooking/overbooking.service.js';
import { scoreReservation } from '../risk/riskScoring.service.js';
import { isRestaurantAdmin } from '../restaurants/restaurant.service.js';
import { notifyMatchingWaitlist } from '../waitlist/waitlist.service.js';

export { selectBestFitTable };

/**
 * ===========================================================================
 * THE BOOKING ENGINE
 * ===========================================================================
 *
 * The problem: two people click "Reserve" for the last free table at the same
 * instant. The legacy app had no capacity check at all — audit finding #20 —
 * so it happily wrote both rows and the restaurant found out at 8pm.
 *
 * Why a plain read-then-write does not fix it:
 *
 *   T1: SELECT free tables  -> [T4]        T2: SELECT free tables  -> [T4]
 *   T1: INSERT booking on T4               T2: INSERT booking on T4
 *
 * Both transactions read a consistent snapshot before either wrote. Nothing
 * in the database stops the second INSERT, because the row it conflicts with
 * did not exist when it looked. This is a write-skew phantom.
 *
 * The fix, in three layers:
 *
 *   1. PESSIMISTIC ROW LOCK. Before reading availability we take
 *      SELECT ... FOR UPDATE on the candidate `restaurant_tables` rows. The
 *      second transaction blocks on that lock until the first commits, then
 *      re-reads and sees the new booking. Locking the *table* rows rather
 *      than the reservation rows matters: you cannot lock a row that does not
 *      exist yet, and the conflict here is over a row about to be created.
 *
 *   2. DETERMINISTIC LOCK ORDER. Rows are locked ORDER BY id. If two
 *      transactions grabbed overlapping table sets in different orders they
 *      would deadlock; a single global order makes that impossible.
 *
 *   3. A DATABASE EXCLUSION CONSTRAINT as a backstop (see the Phase 3
 *      migration). Even if application code is wrong, Postgres refuses to
 *      store two active reservations whose time ranges overlap on one table.
 *      Correctness should not depend solely on the application remembering.
 *
 * Multi-restaurant: the FOR UPDATE set is filtered by restaurant_id, so two
 * venues booking the same wall-clock slot lock disjoint table rows and never
 * block each other. The exclusion constraint keys on table_id, which is
 * already per-restaurant, so it also never contends across venues.
 *
 * Overbooking: when every physical table is taken, we still accept
 * floor(Σ P(no-show)) extra covers with table_id NULL. Those rows do not
 * hit the exclusion constraint (NULL table_id is excluded from it) and are
 * assigned a real table at seat time if a no-show freed one.
 *
 * Why pessimistic and not optimistic here: contention is genuinely high — a
 * popular Friday 8pm slot has many people racing for few tables. Optimistic
 * locking would mean most of them do the work, fail the version check, and
 * retry. When collisions are likely, blocking is cheaper than retrying.
 * Reservation *status edits* from the admin panel use @version optimistic
 * locking instead, because two admins editing the same booking is rare.
 */

/** Statuses that still occupy a table. Cancelled and no-show release it. */
export const OCCUPYING_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'];

const TABLE_INCLUDE = {
  table: {
    select: { label: true, zone: true, capacity: true, restaurantId: true },
  },
};

export function riskFeaturesFor({ startsAt, partySize, status, priorBookings, priorNoShows }) {
  const local = utcToLocalParts(startsAt);
  const leadTimeHours = (startsAt.getTime() - Date.now()) / 3_600_000;
  return {
    leadTimeHours,
    partySize,
    dayOfWeek: local.dayOfWeek,
    hour: local.hour,
    isWeekend: local.isWeekend,
    priorBookings: priorBookings ?? 0,
    priorNoShows: priorNoShows ?? 0,
    isConfirmed: status === 'CONFIRMED' || status === 'SEATED',
  };
}

async function invalidateSlotCaches(restaurantId) {
  if (!restaurantId) return;
  await invalidatePrefix(CACHE_KEYS.overbookingPrefix(restaurantId));
}

/**
 * Creates a reservation, or throws ConflictError if nothing is free.
 *
 * `actor` is the signed-in user, or null for a guest booking.
 * `input.restaurantId` is required — bookings are never cross-venue.
 * `input.tableId` pins allocation (waitlist apply) instead of running best-fit.
 */
export async function createReservation(input, actor = null, channel = 'WEB') {
  if (!input.restaurantId) {
    throw new BadRequestError('Restaurant is required to make a booking.');
  }

  const timeProblem = validateBookingTime(input.date, input.time);
  if (timeProblem) throw new BadRequestError(timeProblem);

  const { startsAt, endsAt } = bookingInterval(input.date, input.time);
  const serviceDate = serviceDateFor(input.date);
  const restaurantId = input.restaurantId;
  const leadTimeHours = (startsAt.getTime() - Date.now()) / 3_600_000;

  const MAX_REFERENCE_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      const reservation = await prisma.$transaction(
        async (tx) => {
          await setTenantGuc(tx, restaurantId);

          /**
           * Lock every active table at this restaurant, not only those that
           * fit this party. Overbooking counts extras against the whole slot;
           * locking a subset would let two overbook transactions race on
           * disjoint candidate sets and both accept.
           */
          const locked = await tx.$queryRaw`
            SELECT id, label, capacity
            FROM restaurant_tables
            WHERE restaurant_id = ${restaurantId}::uuid
              AND is_active = true
            ORDER BY id
            FOR UPDATE
          `;

          if (locked.length === 0) {
            throw new ConflictError(
              `We do not have a table that seats ${input.partySize}. Please call us and we will arrange something.`,
            );
          }

          const slotBookings = await tx.reservation.findMany({
            where: {
              restaurantId,
              status: { in: OCCUPYING_STATUSES },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { tableId: true, noShowRisk: true, isOverbooked: true },
          });

          const busy = new Set(slotBookings.map((c) => c.tableId).filter(Boolean));

          let table = null;
          let isOverbooked = false;

          if (input.tableId) {
            table = locked.find((t) => t.id === input.tableId) ?? null;
            if (!table || busy.has(table.id) || table.capacity < input.partySize) {
              throw new ConflictError('That table is no longer free for this party.');
            }
          } else {
            const candidates = locked.filter((t) => t.capacity >= input.partySize);
            if (candidates.length === 0) {
              throw new ConflictError(
                `We do not have a table that seats ${input.partySize}. Please call us and we will arrange something.`,
              );
            }
            table = selectBestFitTable(candidates, busy);

            if (!table) {
              const extra = summariseOverbooking(slotBookings);
              if (extra.remainingExtra < 1) {
                throw new ConflictError(
                  'That time is fully booked. Please choose another slot — the times shown update live.',
                  { waitlistEligible: true },
                );
              }
              isOverbooked = true;
            }
          }

          let priorBookings = 0;
          let priorNoShows = 0;
          if (actor?.id) {
            const guest = await tx.user.findUnique({
              where: { id: actor.id },
              select: { priorBookings: true, priorNoShows: true },
            });
            priorBookings = guest?.priorBookings ?? 0;
            priorNoShows = guest?.priorNoShows ?? 0;
          }

          const scored = scoreReservation(
            riskFeaturesFor({
              startsAt,
              partySize: input.partySize,
              status: 'PENDING',
              priorBookings,
              priorNoShows,
            }),
          );

          const reservationRow = await tx.reservation.create({
            data: {
              reference: generateBookingReference(),
              restaurantId,
              userId: actor?.id ?? null,
              guestName: input.guestName,
              guestPhone: input.guestPhone,
              guestEmail: input.guestEmail ?? actor?.email ?? null,
              partySize: input.partySize,
              startsAt,
              endsAt,
              serviceDate,
              tableId: table?.id ?? null,
              status: 'PENDING',
              channel,
              specialRequests: input.specialRequests ?? null,
              leadTimeHours,
              noShowRisk: scored.noShowRisk,
              riskModelVersion: scored.riskModelVersion,
              isOverbooked,
            },
            include: TABLE_INCLUDE,
          });

          if (actor?.id) {
            await tx.user.update({
              where: { id: actor.id },
              data: { priorBookings: { increment: 1 } },
            });
          }

          return reservationRow;
        },
        {
          timeout: 10_000,
          maxWait: 5_000,
        },
      );

      await invalidateSlotCaches(restaurantId);
      return reservation;
    } catch (err) {
      const isReferenceCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('reference');

      if (isReferenceCollision && attempt < MAX_REFERENCE_ATTEMPTS) {
        logger.warn({ attempt }, 'booking reference collision — regenerating');
        continue;
      }

      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
        const cause = String(err.meta?.code ?? '');
        if (cause === '23P01') {
          logger.error(
            { startsAt, partySize: input.partySize, restaurantId },
            'exclusion constraint rejected a booking the app thought was free',
          );
          throw new ConflictError('That table was taken a moment ago. Please pick another time.');
        }
      }

      throw err;
    }
  }

  throw new ConflictError('Could not generate a unique booking reference. Please try again.');
}

/**
 * Cancels a booking and frees the table.
 *
 * Guarded by ownership: a user may cancel only their own reservation, and
 * global / restaurant admins may cancel within their scope. The legacy app
 * had no concept of this because bookings were not linked to users at all.
 */
export async function cancelReservation(reservationId, actor) {
  const updated = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: TABLE_INCLUDE,
    });

    if (!reservation) {
      throw new ConflictError('That reservation no longer exists.');
    }

    await setTenantGuc(tx, reservation.restaurantId);

    const tenantId = reservation.restaurantId;
    const isOwner = reservation.userId && actor?.id === reservation.userId;
    let isAdmin = actor?.role === 'ADMIN';

    if (!isAdmin && actor?.id && tenantId) {
      isAdmin = await isRestaurantAdmin(actor.id, tenantId, actor.role);
    }

    if (!isOwner && !isAdmin) {
      throw new ConflictError('That reservation no longer exists.');
    }

    if (reservation.status === 'CANCELLED') {
      return { reservation, newlyCancelled: false };
    }
    if (['SEATED', 'COMPLETED'].includes(reservation.status)) {
      throw new BadRequestError('This booking has already been seated and cannot be cancelled.');
    }

    const hoursNotice = (reservation.startsAt.getTime() - Date.now()) / 3_600_000;

    const row = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        version: { increment: 1 },
      },
      include: TABLE_INCLUDE,
    });

    logger.info({ reservationId, hoursNotice: Math.round(hoursNotice) }, 'reservation cancelled');
    return { reservation: row, newlyCancelled: true };
  });

  const tenantId = updated.reservation.restaurantId;
  if (updated.newlyCancelled && tenantId) {
    await invalidateSlotCaches(tenantId);
    try {
      const local = utcToLocalParts(updated.reservation.startsAt);
      await notifyMatchingWaitlist({
        restaurantId: tenantId,
        date: local.date,
        time: local.time,
        partySize: updated.reservation.partySize,
      });
    } catch (err) {
      logger.error({ err, reservationId }, 'waitlist notify after cancel failed');
    }
  }

  return updated.reservation;
}

/** Config the booking form needs in order to render correct options. */
export function bookingRules() {
  return {
    openHour: env.RESTAURANT_OPEN_HOUR,
    closeHour: env.RESTAURANT_CLOSE_HOUR,
    slotMinutes: env.SLOT_MINUTES,
    diningDurationMinutes: env.DINING_DURATION_MINUTES,
    maxAdvanceDays: env.MAX_ADVANCE_BOOKING_DAYS,
    minLeadMinutes: env.MIN_LEAD_TIME_MINUTES,
    maxPartySize: env.MAX_PARTY_SIZE,
    utcOffsetMinutes: env.RESTAURANT_UTC_OFFSET_MINUTES,
  };
}
