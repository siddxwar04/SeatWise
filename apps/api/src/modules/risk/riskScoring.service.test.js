import { describe, expect, it } from 'vitest';
import { extractFeatures, riskLevel, scoreNoShowRisk } from './riskScoring.service.js';

describe('extractFeatures', () => {
  it('normalises lead time against a two-week window', () => {
    const features = extractFeatures({ leadTimeHours: 168, partySize: 2 });
    expect(features.leadTime).toBeCloseTo(0.5, 5);
    expect(features.partySize).toBeCloseTo(0.2, 5);
  });

  it('uses zero no-show rate when the guest has no history', () => {
    const features = extractFeatures({ priorBookings: 0, priorNoShows: 7 });
    expect(features.guestNoShowRate).toBe(0);
  });

  it('treats Friday as weekend (high-variance service)', () => {
    const features = extractFeatures({ dayOfWeek: 5, hour: 19 });
    expect(features.isWeekend).toBe(1);
    expect(features.isLate).toBe(0);
  });
});

describe('scoreNoShowRisk', () => {
  it('scores a confirmed regular at about 5%, not a coin flip', () => {
    const p = scoreNoShowRisk({
      leadTimeHours: 24,
      partySize: 2,
      dayOfWeek: 2,
      hour: 19,
      priorBookings: 8,
      priorNoShows: 0,
      isConfirmed: true,
    });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.2);
    expect(riskLevel(p)).toBe('low');
  });

  it('scores an unconfirmed serial no-show in the 70% band', () => {
    const p = scoreNoShowRisk({
      leadTimeHours: 240,
      partySize: 8,
      dayOfWeek: 6,
      hour: 21,
      priorBookings: 4,
      priorNoShows: 2,
      isConfirmed: false,
    });
    expect(p).toBeGreaterThan(0.5);
    expect(riskLevel(p)).toBe('high');
  });

  it('drops risk when the same booking is confirmed', () => {
    const base = {
      leadTimeHours: 72,
      partySize: 4,
      dayOfWeek: 5,
      hour: 20,
      priorBookings: 2,
      priorNoShows: 1,
    };
    const pending = scoreNoShowRisk({ ...base, isConfirmed: false });
    const confirmed = scoreNoShowRisk({ ...base, isConfirmed: true });
    expect(confirmed).toBeLessThan(pending);
  });
});
