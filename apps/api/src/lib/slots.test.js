import { describe, expect, it } from 'vitest';
import {
  bookingInterval,
  generateSlots,
  intervalsOverlap,
  localToUtc,
  validateBookingTime,
} from './slots.js';

describe('validateBookingTime lead time', () => {
  // 19:00 IST on the day of service.
  const now = localToUtc('2026-08-05', '19:00');

  it('refuses a seating inside the lead time for an ordinary booking', () => {
    expect(validateBookingTime('2026-08-05', '19:30', now, { minLeadMinutes: 60 })).toMatch(
      /at least 1 hour/,
    );
  });

  it('allows the same seating when the lead time is waived for the waitlist', () => {
    expect(validateBookingTime('2026-08-05', '19:30', now, { minLeadMinutes: 0 })).toBeNull();
  });

  it('never allows a seating that has already started, waived or not', () => {
    expect(validateBookingTime('2026-08-05', '18:30', now, { minLeadMinutes: 0 })).toMatch(
      /already started/,
    );
  });
});

describe('generateSlots', () => {
  it('starts at open and stops so a full dining window still fits', () => {
    const slots = generateSlots();
    expect(slots[0]).toBe('11:00');
    // Last start: 23:00 close − 90 min dining = 21:30
    expect(slots.at(-1)).toBe('21:30');
    expect(slots).toContain('19:30');
  });
});

describe('intervalsOverlap', () => {
  it('treats ranges as half-open so back-to-back seatings do not clash', () => {
    const aStart = new Date('2026-08-01T13:30:00.000Z');
    const aEnd = new Date('2026-08-01T15:00:00.000Z');
    const bStart = new Date('2026-08-01T15:00:00.000Z');
    const bEnd = new Date('2026-08-01T16:30:00.000Z');
    expect(intervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(false);
  });

  it('detects a real overlap', () => {
    const aStart = new Date('2026-08-01T13:30:00.000Z');
    const aEnd = new Date('2026-08-01T15:00:00.000Z');
    const bStart = new Date('2026-08-01T14:00:00.000Z');
    const bEnd = new Date('2026-08-01T15:30:00.000Z');
    expect(intervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
  });
});

describe('localToUtc / bookingInterval', () => {
  it('converts IST wall-clock time to the correct UTC instant', () => {
    // 19:30 IST = 14:00 UTC
    const utc = localToUtc('2026-08-05', '19:30');
    expect(utc.toISOString()).toBe('2026-08-05T14:00:00.000Z');
  });

  it('builds a 90-minute half-open dining window', () => {
    const { startsAt, endsAt } = bookingInterval('2026-08-05', '19:30');
    expect(startsAt.toISOString()).toBe('2026-08-05T14:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-08-05T15:30:00.000Z');
  });
});
