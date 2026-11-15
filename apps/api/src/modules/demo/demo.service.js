import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { generateBookingReference } from '../../lib/reference.js';
import {
  bookingInterval,
  generateSlots,
  intervalsOverlap,
  serviceDateFor,
  todayLocal,
} from '../../lib/slots.js';
import { issueSession } from '../auth/auth.service.js';
import { OCCUPYING_STATUSES, riskFeaturesFor } from '../reservations/booking.service.js';
import { scoreReservation } from '../risk/riskScoring.service.js';

/**
 * One-click demo sign-in.
 *
 * A reviewer who opens the live site should be able to see both sides of the
 * product — the diner flow and the owner console — without being handed a
 * password. These are real accounts and real sessions, so everything behind
 * them (role checks, venue scoping, the booking engine) is the real code path.
 *
 * What keeps a public account safe:
 *   - it only exists when DEMO_LOGIN_ENABLED=true;
 *   - nobody knows its password (a random one is stored), so it cannot be
 *     signed into, changed, or reset the normal way;
 *   - the owner manages exactly one venue and is not a platform admin;
 *   - destructive or account-level writes are refused (see blockDemoWrites).
 */
export const DEMO_ACCOUNTS = {
  diner: { email: 'demo.diner@seatwise.app', username: 'Demo Diner', phone: '9876500010' },
  owner: { email: 'demo.owner@seatwise.app', username: 'Demo Owner', phone: '9876500011' },
};

/** Guests who populate the demo venue's book. The second has a no-show history. */
const DEMO_GUESTS = [
  {
    email: 'demo.regular@seatwise.app',
    username: 'Asha Rao',
    phone: '9876500021',
    priorBookings: 6,
    priorNoShows: 0,
  },
  {
    email: 'demo.flaky@seatwise.app',
    username: 'Ravi Menon',
    phone: '9876500022',
    priorBookings: 5,
    priorNoShows: 3,
  },
];

const DEMO_VENUE_SLUG = 'forno-nove';
/** The seating the demo fills completely, so "fully booked" is real to look at. */
const PEAK_TIME = '20:00';

const DEMO_EMAILS = new Set(
  [...Object.values(DEMO_ACCOUNTS), ...DEMO_GUESTS].map((account) => account.email),
);

export const isDemoEnabled = () => env.DEMO_LOGIN_ENABLED;
export const isDemoEmail = (email) => DEMO_EMAILS.has(String(email ?? '').toLowerCase());

/** Express middleware: demo accounts may look at everything but not rewrite it. */
export function blockDemoWrites(req, _res, next) {
  if (isDemoEmail(req.user?.email)) {
    next(new ForbiddenError('This is a shared demo account, so that change is switched off.'));
    return;
  }
  next();
}

/**
 * Finds the account, creating it on first use. A demo guest's booking history
 * is part of the script — it is what gives one of them a high risk score — so
 * it is put back if anything has moved it.
 */
async function ensureAccount({ email, username, phone, ...counters }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const drifted = Object.entries(counters).some(([key, value]) => existing[key] !== value);
    return drifted ? prisma.user.update({ where: { email }, data: counters }) : existing;
  }

  return prisma.user.create({
    data: {
      email,
      username,
      phone,
      // Unknowable on purpose — the only way in is the demo endpoint.
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), env.BCRYPT_ROUNDS),
      emailVerifiedAt: new Date(),
      ...counters,
    },
  });
}

/** A few bookings through the day, so the list is not one solid block at 8 PM. */
const SPREAD = [
  { name: 'Asha Rao', size: 2, guest: 0, confirmed: true },
  { name: 'Ravi Menon', size: 4, guest: 1 },
  { name: 'Meera Iyer', size: 2, guest: 0 },
  { name: 'Office lunch', size: 6, guest: 1, confirmed: true },
  { name: 'Kabir Das', size: 2, guest: 1 },
  { name: 'Priya Nair', size: 4, guest: 0 },
];

const PEAK_NAMES = [
  'Nina Kapoor',
  'Arjun Shah',
  'Sana Ali',
  'Rohit Kulkarni',
  'Birthday table',
  'Tara Mehta',
  'Aditya Sharma',
  'Zoya Menon',
  'Date night',
  'Dev Patel',
  'Team dinner',
  'Ishaan Roy',
  'Anjali Sinha',
  'Farhan Khan',
  'Old friends',
  'Leela Nair',
  'Vikram Rao',
  'Pooja Desai',
];

/**
 * Plans today's demo bookings in memory. Pure, so it can be tested without a
 * database.
 *
 *   - a handful spread across the remaining seatings;
 *   - the peak seating filled table by table until none is left, then one more
 *     with no table — the overbooked booking the risk model allows.
 *
 * Tables already taken (by a reviewer's own booking, say) are left alone, so
 * the plan never collides with the database's no-overlap rule.
 */
export function planDemoService({ date, tables, existing, now }) {
  const taken = existing.filter((r) => r.tableId).map((r) => ({ ...r }));
  const isFree = (table, startsAt, endsAt) =>
    !taken.some(
      (r) => r.tableId === table.id && intervalsOverlap(r.startsAt, r.endsAt, startsAt, endsAt),
    );
  const bySize = [...tables].sort((a, b) => a.capacity - b.capacity);

  const upcoming = generateSlots().filter(
    (time) => bookingInterval(date, time).startsAt.getTime() > now.getTime() + 5 * 60_000,
  );
  if (upcoming.length === 0) return [];

  const rows = [];
  const add = (time, party, table, extra = {}) => {
    const { startsAt, endsAt } = bookingInterval(date, time);
    if (table) taken.push({ tableId: table.id, startsAt, endsAt });
    rows.push({ time, startsAt, endsAt, tableId: table?.id ?? null, ...party, ...extra });
  };

  const peak = upcoming.includes(PEAK_TIME) ? PEAK_TIME : upcoming.at(-1);

  // Spread: evenly through the seatings that do not touch the peak.
  const quiet = upcoming.filter((time) => {
    const a = bookingInterval(date, time);
    const b = bookingInterval(date, peak);
    return !intervalsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt);
  });
  SPREAD.forEach((party, index) => {
    if (quiet.length === 0) return;
    const time = quiet[Math.floor((index * quiet.length) / SPREAD.length)];
    const { startsAt, endsAt } = bookingInterval(date, time);
    const table = bySize.find((t) => t.capacity >= party.size && isFree(t, startsAt, endsAt));
    if (table) add(time, party, table);
  });

  // Peak: every table that is still free gets a party that fits it.
  const { startsAt, endsAt } = bookingInterval(date, peak);
  let seated = 0;
  for (const table of bySize) {
    if (!isFree(table, startsAt, endsAt)) continue;
    const size = Math.max(2, table.capacity - (seated % 3 === 0 ? 0 : 1));
    add(
      peak,
      {
        name: PEAK_NAMES[seated % PEAK_NAMES.length],
        size: Math.min(size, table.capacity),
        // Roughly one in three is the guest with a no-show history.
        guest: seated % 3 === 1 ? 1 : 0,
        confirmed: seated % 2 === 0,
      },
      table,
    );
    seated += 1;
  }

  // One party accepted beyond the room, as the overbooking rule permits when
  // the expected no-shows for the seating reach one.
  if (seated > 0) {
    add(peak, { name: 'Walk-in request', size: 2, guest: 1 }, null, { isOverbooked: true });
  }

  return rows;
}

/**
 * Makes sure the demo venue has a believable evening on its book.
 *
 * Seeded bookings go stale — a reviewer next month would open an empty
 * console. Instead, the first demo-owner sign-in of each day lays out today:
 * a few bookings through the day and one seating that is completely full, so
 * the risk queue, the overbooking page and the waitlist all have something
 * true to show. It is written in a handful of queries because it runs inside
 * a sign-in.
 */
export async function ensureDemoService(restaurant, now = new Date()) {
  const date = todayLocal();
  const serviceDate = serviceDateFor(date);

  const alreadyLaidOut = await prisma.reservation.count({
    where: {
      restaurantId: restaurant.id,
      serviceDate,
      guestEmail: { in: DEMO_GUESTS.map((g) => g.email) },
      isOverbooked: true,
    },
  });
  if (alreadyLaidOut > 0) return 0;

  const [tables, existing, ...guests] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: { id: true, capacity: true },
    }),
    prisma.reservation.findMany({
      where: { restaurantId: restaurant.id, serviceDate, status: { in: OCCUPYING_STATUSES } },
      select: { tableId: true, startsAt: true, endsAt: true, noShowRisk: true, isOverbooked: true },
    }),
    ...DEMO_GUESTS.map((guest) => ensureAccount(guest)),
  ]);

  const plan = planDemoService({ date, tables, existing, now });
  if (plan.length === 0) return 0;

  const toRow = (row) => {
    const guest = guests[row.guest];
    const status = row.confirmed ? 'CONFIRMED' : 'PENDING';
    const scored = scoreReservation(
      riskFeaturesFor({
        startsAt: row.startsAt,
        partySize: row.size,
        status,
        priorBookings: guest.priorBookings,
        priorNoShows: guest.priorNoShows,
      }),
    );
    return {
      reference: generateBookingReference(),
      restaurantId: restaurant.id,
      userId: guest.id,
      guestName: row.name,
      guestPhone: guest.phone,
      guestEmail: guest.email,
      partySize: row.size,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      serviceDate,
      tableId: row.tableId,
      status,
      channel: 'WEB',
      leadTimeHours: Math.max(0, (row.startsAt.getTime() - now.getTime()) / 3_600_000),
      noShowRisk: scored.noShowRisk,
      riskModelVersion: scored.riskModelVersion,
      isOverbooked: row.isOverbooked ?? false,
    };
  };

  const data = plan.map(toRow);

  // The booking engine keeps a full seating open while expected no-shows still
  // cover another party (floor of the summed risk). Use up that allowance, so
  // the peak is genuinely "fully booked" and the waitlist has something to do.
  const peak = plan.find((row) => row.isOverbooked);
  if (peak) {
    const inPeak = (r) => intervalsOverlap(r.startsAt, r.endsAt, peak.startsAt, peak.endsAt);
    const overlapping = [...existing, ...data].filter(inPeak);
    let risk = overlapping.reduce((sum, r) => sum + (r.noShowRisk ?? 0), 0);
    let extras = overlapping.filter((r) => r.isOverbooked).length;

    while (extras < Math.floor(risk) && extras < 8) {
      const row = toRow({ ...peak, name: `Walk-in request ${extras + 1}`, guest: extras % 2 });
      data.push(row);
      risk += row.noShowRisk;
      extras += 1;
    }
  }

  const { count } = await prisma.reservation.createMany({ data });
  logger.info({ restaurantId: restaurant.id, created: count }, 'demo service laid out');
  return count;
}

export async function demoLogin(role, context) {
  if (!isDemoEnabled()) throw new NotFoundError('Demo sign-in is not available.');

  const account = DEMO_ACCOUNTS[role];
  if (!account) throw new NotFoundError('Unknown demo account.');

  const user = await ensureAccount(account);

  if (role === 'owner') {
    const restaurant = await prisma.restaurant.findUnique({ where: { slug: DEMO_VENUE_SLUG } });
    if (!restaurant) {
      throw new NotFoundError('The demo restaurant has not been set up. Run the database seed.');
    }
    await prisma.restaurantAdmin.upsert({
      where: { userId_restaurantId: { userId: user.id, restaurantId: restaurant.id } },
      update: {},
      create: { userId: user.id, restaurantId: restaurant.id },
    });
    try {
      await ensureDemoService(restaurant);
    } catch (err) {
      // An empty console is a worse demo, not a failed login.
      logger.warn({ err: err.message }, 'could not lay out the demo service');
    }
  }

  logger.info({ role }, 'demo sign-in');
  return issueSession(user, context);
}
