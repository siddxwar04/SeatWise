import { env } from '../config/env.js';

/**
 * Time handling for the booking engine.
 *
 * Everything is stored in the database as UTC. Everything a human types or
 * reads is restaurant-local wall-clock time. These helpers are the only place
 * that conversion happens, so the rest of the codebase never has to think
 * about it.
 *
 * The legacy app stored a bare date and time string with no timezone at all,
 * which works right up until the server and the diner are in different ones.
 */

const MINUTE_MS = 60_000;
const OFFSET_MS = env.RESTAURANT_UTC_OFFSET_MINUTES * MINUTE_MS;

/** "2026-08-05" + "19:30" -> the UTC Date for that local wall-clock moment. */
export function localToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  // Date.UTC treats the parts as UTC; subtracting the offset shifts them back
  // to the real instant that local clock time refers to.
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) - OFFSET_MS);
}

/** Inverse of localToUtc: a UTC Date -> local calendar/clock parts. */
export function utcToLocalParts(date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    /** 0 = Sunday, matching JS convention. */
    dayOfWeek: shifted.getUTCDay(),
    isWeekend: shifted.getUTCDay() === 0 || shifted.getUTCDay() === 6,
  };
}

/**
 * The `serviceDate` column is a DATE, and Prisma maps that through a JS Date
 * at UTC midnight. Building it from the local calendar date keeps the grouping
 * correct — a 00:30 booking belongs to the evening that produced it only if
 * the restaurant is open then, and here it simply belongs to its own date.
 */
export function serviceDateFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/** Today's date in the restaurant's timezone, as "YYYY-MM-DD". */
export function todayLocal() {
  return utcToLocalParts(new Date()).date;
}

/**
 * Every bookable start time for a service day, e.g. 11:00, 11:30, … 21:30.
 *
 * A slot is only offered if the full dining duration fits before closing —
 * there is no point selling a 22:45 seating when the kitchen shuts at 23:00.
 */
export function generateSlots() {
  const slots = [];
  const openMinutes = env.RESTAURANT_OPEN_HOUR * 60;
  const closeMinutes = env.RESTAURANT_CLOSE_HOUR * 60;
  const lastStart = closeMinutes - env.DINING_DURATION_MINUTES;

  for (let m = openMinutes; m <= lastStart; m += env.SLOT_MINUTES) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

/** A booking occupies [startsAt, endsAt) — half-open, so 19:00-20:30 and
 *  20:30-22:00 do not collide. */
export function bookingInterval(dateStr, timeStr) {
  const startsAt = localToUtc(dateStr, timeStr);
  const endsAt = new Date(startsAt.getTime() + env.DINING_DURATION_MINUTES * MINUTE_MS);
  return { startsAt, endsAt };
}

/**
 * Two half-open intervals overlap iff each starts before the other ends.
 * This is the single rule the whole double-booking guarantee rests on, and it
 * is mirrored exactly by the SQL in the booking service and by the database
 * exclusion constraint.
 */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/** Whole days between now and a booking. An ML feature — no-show rate climbs
 *  with lead time. */
export function leadTimeDays(startsAt, now = new Date()) {
  return Math.max(0, Math.floor((startsAt.getTime() - now.getTime()) / 86_400_000));
}

/**
 * Every reason a requested time can be refused, in one place.
 * Returns null when the slot is acceptable, or a human-readable string.
 */
export function validateBookingTime(dateStr, timeStr, now = new Date()) {
  const slots = generateSlots();
  if (!slots.includes(timeStr)) {
    return `We seat guests every ${env.SLOT_MINUTES} minutes between ${String(
      env.RESTAURANT_OPEN_HOUR,
    ).padStart(2, '0')}:00 and ${String(env.RESTAURANT_CLOSE_HOUR).padStart(2, '0')}:00. Please pick one of the listed times.`;
  }

  const { startsAt } = bookingInterval(dateStr, timeStr);

  // Audit finding #19: the legacy form accepted bookings in the past, at 4 AM,
  // and 50 years out.
  const minStart = now.getTime() + env.MIN_LEAD_TIME_MINUTES * MINUTE_MS;
  if (startsAt.getTime() < minStart) {
    return env.MIN_LEAD_TIME_MINUTES >= 60
      ? `Please book at least ${Math.round(env.MIN_LEAD_TIME_MINUTES / 60)} hour(s) ahead.`
      : `Please book at least ${env.MIN_LEAD_TIME_MINUTES} minutes ahead.`;
  }

  const maxStart = now.getTime() + env.MAX_ADVANCE_BOOKING_DAYS * 86_400_000;
  if (startsAt.getTime() > maxStart) {
    return `We only take bookings up to ${env.MAX_ADVANCE_BOOKING_DAYS} days in advance.`;
  }

  return null;
}
