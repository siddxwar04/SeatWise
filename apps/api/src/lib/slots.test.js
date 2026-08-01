import { describe, expect, it } from 'vitest';
import { bookingInterval, generateSlots, intervalsOverlap, localToUtc } from './slots.js';

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
