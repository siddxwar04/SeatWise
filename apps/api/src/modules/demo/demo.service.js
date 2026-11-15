import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { generateSlots, localToUtc, serviceDateFor, todayLocal } from '../../lib/slots.js';
import { issueSession } from '../auth/auth.service.js';
import { createReservation } from '../reservations/booking.service.js';

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
  { email: 'demo.regular@seatwise.app', username: 'Asha Rao', phone: '9876500021', noShows: 0 },
  { email: 'demo.flaky@seatwise.app', username: 'Ravi Menon', phone: '9876500022', noShows: 3 },
];

const DEMO_VENUE_SLUG = 'forno-nove';
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

async function upsertAccount({ email, username, phone }, extra = {}) {
  return prisma.user.upsert({
    where: { email },
    update: { username, phone, ...extra },
    create: {
      email,
      username,
      phone,
      // Unknowable on purpose — the only way in is the demo endpoint.
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), env.BCRYPT_ROUNDS),
      emailVerifiedAt: new Date(),
      ...extra,
    },
  });
}

const PARTIES = [
  { name: 'Asha Rao', size: 2, guest: 0 },
  { name: 'Ravi Menon', size: 4, guest: 1 },
  { name: 'Meera Iyer', size: 2, guest: 0 },
  { name: 'Office dinner', size: 6, guest: 1 },
  { name: 'Kabir Das', size: 2, guest: 1 },
  { name: 'Priya Nair', size: 4, guest: 0 },
  { name: 'Nina Kapoor', size: 3, guest: 0 },
  { name: 'Late table', size: 2, guest: 1 },
];

/**
 * Makes sure the demo venue has a believable evening on its book.
 *
 * Seeded bookings go stale — a reviewer next month would open an empty
 * console. Instead, the first demo-owner sign-in of each day tops today up
 * through the normal booking engine, so the tables, risk scores and overlap
 * rules are the real ones rather than hand-written rows.
 */
export async function ensureDemoService(restaurant, now = new Date()) {
  const today = todayLocal();
  const existing = await prisma.reservation.count({
    where: { restaurantId: restaurant.id, serviceDate: serviceDateFor(today) },
  });
  if (existing >= 5) return 0;

  const guests = [];
  for (const guest of DEMO_GUESTS) {
    guests.push(
      await upsertAccount(guest, {
        priorBookings: guest.noShows ? 5 : 6,
        priorNoShows: guest.noShows,
      }),
    );
  }

  // Seatings that have not started yet, spread across what is left of the day.
  const upcoming = generateSlots().filter(
    (time) => localToUtc(today, time).getTime() > now.getTime() + 5 * 60_000,
  );
  if (upcoming.length === 0) return 0;

  let created = 0;
  for (const [index, party] of PARTIES.entries()) {
    const time = upcoming[Math.floor((index * upcoming.length) / PARTIES.length)];
    try {
      const reservation = await createReservation(
        {
          restaurantId: restaurant.id,
          guestName: party.name,
          guestPhone: guests[party.guest].phone,
          partySize: party.size,
          date: today,
          time,
        },
        guests[party.guest],
        'WEB',
        { waiveLeadTime: true },
      );
      // Every third booking is already confirmed, so the list shows both states.
      if (index % 3 === 0) {
        await prisma.reservation.update({
          where: { id: reservation.id },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        });
      }
      created += 1;
    } catch (err) {
      // A full slot or an oversized party is fine — skip it and keep going.
      logger.debug({ err: err.message, time }, 'demo booking skipped');
    }
  }

  logger.info({ restaurantId: restaurant.id, created }, 'demo service topped up');
  return created;
}

export async function demoLogin(role, context) {
  if (!isDemoEnabled()) throw new NotFoundError('Demo sign-in is not available.');

  const account = DEMO_ACCOUNTS[role];
  if (!account) throw new NotFoundError('Unknown demo account.');

  const user = await upsertAccount(account);

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
      logger.warn({ err: err.message }, 'could not top up the demo service');
    }
  }

  logger.info({ role }, 'demo sign-in');
  return issueSession(user, context);
}
