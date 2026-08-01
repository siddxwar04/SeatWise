/**
 * Concurrency proof for createReservation().
 *
 * Unit tests can show best-fit logic is correct. They cannot show that two
 * simultaneous "Reserve" clicks for the last table produce one booking and
 * one ConflictError. That requires a real Postgres, real transactions, and
 * real row locks — which is what this file does.
 *
 * Also proves multi-restaurant isolation: two venues can book the same
 * wall-clock slot concurrently with zero cross-tenant lock contention,
 * because FOR UPDATE is scoped by restaurant_id and the exclusion constraint
 * keys on table_id (already per-restaurant).
 *
 * Prerequisites:
 *   npm run db:test          # starts postgres-test + migrates
 *   npm run test:concurrency
 *
 * Do NOT import this file from the default unit-test run — see vitest.config.js.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../../errors/AppError.js';
import { disconnectPrisma, prisma } from '../../lib/prisma.js';
import { bookingInterval, todayLocal } from '../../lib/slots.js';
import { createReservation } from './booking.service.js';

const CONCURRENCY = 20;
const PARTY_SIZE = 2;
/** Exact capacity fit — one table, no overflow seating elsewhere. */
const TABLE_CAPACITY = 2;
const TABLE_LABEL = 'LOCK-T1';

/** A date far enough ahead that validateBookingTime never rejects on lead time. */
function bookingDateDaysAhead(days) {
  const [y, m, d] = todayLocal().split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function guestPayload(restaurantId, date, time, suffix) {
  return {
    restaurantId,
    guestName: `Racer ${suffix}`,
    guestPhone: `9000000${String(suffix).padStart(3, '0')}`.slice(0, 10),
    guestEmail: `racer${suffix}@test.local`,
    partySize: PARTY_SIZE,
    date,
    time,
    specialRequests: null,
  };
}

async function settle(promises) {
  const settled = await Promise.allSettled(promises);
  return {
    fulfilled: settled.filter((r) => r.status === 'fulfilled'),
    rejected: settled.filter((r) => r.status === 'rejected'),
    settled,
  };
}

describe('createReservation concurrency (real Postgres)', () => {
  const date = bookingDateDaysAhead(14);
  const slotTime = '19:00';
  let restaurant;
  let table;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new Error(
        [
          'Test database is unreachable.',
          'Start it and apply migrations first:',
          '  npm run db:test',
          '  npm run test:concurrency',
          `Underlying error: ${err.message}`,
        ].join('\n'),
      );
    }
  });

  beforeEach(async () => {
    // Wipe booking state so each case starts from an empty dining room.
    // Order matters: reservations → tables → admins → restaurants.
    await prisma.reservation.deleteMany({});
    await prisma.restaurantTable.deleteMany({});
    await prisma.restaurantAdmin.deleteMany({});
    await prisma.menuItem.deleteMany({});
    await prisma.restaurant.deleteMany({});

    restaurant = await prisma.restaurant.create({
      data: {
        slug: 'lock-test-venue',
        name: 'Lock Test Venue',
        address: '1 Test Lane',
        phone: '08000000001',
        isActive: true,
      },
    });

    table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurant.id,
        label: TABLE_LABEL,
        capacity: TABLE_CAPACITY,
        zone: 'INDOOR',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it(`admits exactly 1 of ${CONCURRENCY} simultaneous bookings for the same table/window`, async () => {
    const { startsAt, endsAt } = bookingInterval(date, slotTime);

    const { fulfilled, rejected } = await settle(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        createReservation(guestPayload(restaurant.id, date, slotTime, i + 1)),
      ),
    );

    expect(
      fulfilled,
      `expected 1 success, got ${fulfilled.length}. Rejections: ${rejected
        .map((r) => r.reason?.name + ': ' + r.reason?.message)
        .join(' | ')}`,
    ).toHaveLength(1);

    expect(rejected).toHaveLength(CONCURRENCY - 1);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(ConflictError);
    }

    // Trust the database, not only the Promise results — a bug that wrote
    // two rows but somehow only returned one success would still fail here.
    const rows = await prisma.reservation.findMany({
      where: {
        tableId: table.id,
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(fulfilled[0].value.id);
    expect(rows[0].partySize).toBe(PARTY_SIZE);
  }, 60_000);

  it('rejects an overlapping (non-identical) window on the same table under concurrency', async () => {
    // Dining duration is 90 minutes:
    //   19:00 → [19:00, 20:30)
    //   20:00 → [20:00, 21:30)
    // These overlap. Half-open exact adjacency (20:30 start) would NOT.
    const early = '19:00';
    const late = '20:00';

    const { fulfilled, rejected } = await settle([
      createReservation(guestPayload(restaurant.id, date, early, 1)),
      createReservation(guestPayload(restaurant.id, date, late, 2)),
    ]);

    expect(
      fulfilled,
      `expected exactly one winner for overlapping windows; got ${fulfilled.length}. ` +
        `Rejections: ${rejected.map((r) => r.reason?.message).join(' | ')}`,
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const occupying = await prisma.reservation.findMany({
      where: {
        tableId: table.id,
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'] },
      },
    });

    expect(occupying).toHaveLength(1);

    // Winner is whichever transaction acquired the row lock first — either
    // start time is valid; the invariant is exclusivity, not which one wins.
    expect(['19:00', '20:00']).toContain(
      (() => {
        const earlyStart = bookingInterval(date, early).startsAt.getTime();
        const lateStart = bookingInterval(date, late).startsAt.getTime();
        const actual = occupying[0].startsAt.getTime();
        if (actual === earlyStart) return '19:00';
        if (actual === lateStart) return '20:00';
        return 'unknown';
      })(),
    );
  }, 60_000);

  it('lets Restaurant A and Restaurant B both book the same wall-clock slot (no cross-tenant contention)', async () => {
    /**
     * Two restaurants, one capacity-2 table each, identical 19:00 slot.
     * If FOR UPDATE or the exclusion constraint leaked across venues, one
     * of these would block or fail. Both must succeed, and both rows must
     * land on different table_ids.
     */
    const restaurantB = await prisma.restaurant.create({
      data: {
        slug: 'lock-test-venue-b',
        name: 'Lock Test Venue B',
        address: '2 Test Lane',
        phone: '08000000002',
        isActive: true,
      },
    });

    const tableB = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantB.id,
        label: TABLE_LABEL,
        capacity: TABLE_CAPACITY,
        zone: 'INDOOR',
        isActive: true,
      },
    });

    const startedAt = Date.now();
    const { fulfilled, rejected } = await settle([
      createReservation(guestPayload(restaurant.id, date, slotTime, 101)),
      createReservation(guestPayload(restaurantB.id, date, slotTime, 102)),
    ]);
    const elapsedMs = Date.now() - startedAt;

    expect(
      fulfilled,
      `expected both restaurants to succeed; got ${fulfilled.length}. ` +
        `Rejections: ${rejected.map((r) => r.reason?.message).join(' | ')}`,
    ).toHaveLength(2);
    expect(rejected).toHaveLength(0);

    const rows = await prisma.reservation.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED'] },
      },
      include: { table: { select: { id: true, restaurantId: true } } },
    });

    expect(rows).toHaveLength(2);
    const tableIds = new Set(rows.map((r) => r.tableId));
    expect(tableIds.has(table.id)).toBe(true);
    expect(tableIds.has(tableB.id)).toBe(true);
    expect(new Set(rows.map((r) => r.table.restaurantId)).size).toBe(2);

    // Sanity: concurrent path should finish quickly. Serialising on a shared
    // lock across restaurants would still succeed eventually, but this keeps
    // an eye on pathological waits (each txn is cheap when locks are disjoint).
    expect(elapsedMs).toBeLessThan(5_000);
  }, 60_000);
});
