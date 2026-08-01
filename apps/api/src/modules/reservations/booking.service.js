import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { BadRequestError, ConflictError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { generateBookingReference } from '../../lib/reference.js';
import { bookingInterval, serviceDateFor, validateBookingTime } from '../../lib/slots.js';

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
 * Why pessimistic and not optimistic here: contention is genuinely high — a
 * popular Friday 8pm slot has many people racing for few tables. Optimistic
 * locking would mean most of them do the work, fail the version check, and
 * retry. When collisions are likely, blocking is cheaper than retrying.
 * Reservation *status edits* from the admin panel use @version optimistic
 * locking instead, because two admins editing the same booking is rare.
 */

/** Statuses that still occupy a table. Cancelled and no-show release it. */
const OCCUPYING_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'];

/**
 * Best-fit table selection.
 *
 * Of the tables that are free and large enough, take the SMALLEST. Seating a
 * party of two at the ten-top means the next group of ten cannot be seated at
 * all — this is the bin-packing intuition, and best-fit is the standard greedy
 * heuristic for it. Ties break on label so allocation is deterministic and
 * therefore testable.
 */
export function selectBestFitTable(candidates, busyTableIds) {
  const free = candidates.filter((t) => !busyTableIds.has(t.id));
  if (free.length === 0) return null;

  return free.reduce((best, table) => {
    if (table.capacity !== best.capacity) {
      return table.capacity < best.capacity ? table : best;
    }
    return table.label < best.label ? table : best;
  });
}

/**
 * Creates a reservation, or throws ConflictError if nothing is free.
 *
 * `actor` is the signed-in user, or null for a guest booking.
 */
export async function createReservation(input, actor = null, channel = 'WEB') {
  const timeProblem = validateBookingTime(input.date, input.time);
  if (timeProblem) throw new BadRequestError(timeProblem);

  const { startsAt, endsAt } = bookingInterval(input.date, input.time);
  const serviceDate = serviceDateFor(input.date);

  // Retry only for the astronomically unlikely reference collision. A booking
  // conflict is a real answer and is never retried.
  const MAX_REFERENCE_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          /**
           * Step 1 — lock every table that could seat this party.
           *
           * ORDER BY id is the deadlock guard described above. FOR UPDATE
           * blocks any concurrent transaction that wants the same rows.
           */
          const candidates = await tx.$queryRaw`
            SELECT id, label, capacity
            FROM restaurant_tables
            WHERE is_active = true
              AND capacity >= ${input.partySize}
            ORDER BY id
            FOR UPDATE
          `;

          if (candidates.length === 0) {
            throw new ConflictError(
              `We do not have a table that seats ${input.partySize}. Please call us and we will arrange something.`,
            );
          }

          /**
           * Step 2 — of those, which are already occupied in this window?
           *
           * The overlap test is the half-open interval rule:
           *   existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at
           * so a 19:00-20:30 booking does not block a 20:30 seating.
           *
           * This read is safe from phantoms because every candidate table is
           * locked — no other transaction can be mid-insert against them.
           */
          const candidateIds = candidates.map((t) => t.id);
          const clashes = await tx.reservation.findMany({
            where: {
              tableId: { in: candidateIds },
              status: { in: OCCUPYING_STATUSES },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { tableId: true },
          });

          const busy = new Set(clashes.map((c) => c.tableId));
          const table = selectBestFitTable(candidates, busy);

          if (!table) {
            // Phase 7 replaces this throw with the overbooking decision:
            // if aggregate predicted no-show risk for the slot is high
            // enough, release controlled extra capacity instead of refusing.
            throw new ConflictError(
              'That time is fully booked. Please choose another slot — the times shown update live.',
            );
          }

          /** Step 3 — write the booking while still holding the lock. */
          const reservation = await tx.reservation.create({
            data: {
              reference: generateBookingReference(),
              userId: actor?.id ?? null,
              guestName: input.guestName,
              guestPhone: input.guestPhone,
              guestEmail: input.guestEmail ?? actor?.email ?? null,
              partySize: input.partySize,
              startsAt,
              endsAt,
              serviceDate,
              tableId: table.id,
              status: 'PENDING',
              channel,
              specialRequests: input.specialRequests ?? null,
            },
            include: { table: { select: { label: true, zone: true, capacity: true } } },
          });

          /**
           * Step 4 — keep the ML feature counter current inside the same
           * transaction, so it can never drift from the booking rows.
           */
          if (actor?.id) {
            await tx.user.update({
              where: { id: actor.id },
              data: { priorBookings: { increment: 1 } },
            });
          }

          return reservation;
        },
        {
          // Long enough to wait out a lock held by a slow peer, short enough
          // that a stuck transaction cannot pile up connections indefinitely.
          timeout: 10_000,
          maxWait: 5_000,
        },
      );
    } catch (err) {
      const isReferenceCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('reference');

      if (isReferenceCollision && attempt < MAX_REFERENCE_ATTEMPTS) {
        logger.warn({ attempt }, 'booking reference collision — regenerating');
        continue;
      }

      /**
       * 23P01 is Postgres's exclusion_violation. Reaching it means the
       * application-level check let something through and the database
       * backstop caught it. That is the constraint doing its job, but it is
       * also a bug worth knowing about, so it is logged loudly.
       */
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
        const cause = String(err.meta?.code ?? '');
        if (cause === '23P01') {
          logger.error(
            { startsAt, partySize: input.partySize },
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
 * admins may cancel any. The legacy app had no concept of this because
 * bookings were not linked to users at all.
 */
export async function cancelReservation(reservationId, actor) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });

    if (!reservation) {
      throw new ConflictError('That reservation no longer exists.');
    }

    const isOwner = reservation.userId && actor?.id === reservation.userId;
    const isAdmin = actor?.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      // Deliberately the same message a missing booking gets, so this cannot
      // be used to probe which reservation ids exist.
      throw new ConflictError('That reservation no longer exists.');
    }

    if (reservation.status === 'CANCELLED') {
      return reservation;
    }
    if (['SEATED', 'COMPLETED'].includes(reservation.status)) {
      throw new BadRequestError('This booking has already been seated and cannot be cancelled.');
    }

    // Late cancellations still count against the guest's record — that signal
    // is exactly what the no-show model learns from.
    const hoursNotice = (reservation.startsAt.getTime() - Date.now()) / 3_600_000;

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        version: { increment: 1 },
      },
    });

    logger.info(
      { reservationId, hoursNotice: Math.round(hoursNotice) },
      'reservation cancelled',
    );
    return updated;
  });
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
  };
}
