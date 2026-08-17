import { describe, expect, it } from 'vitest';
import {
  expectedNoShows,
  recommendExtraBookings,
  summariseOverbooking,
} from './overbooking.service.js';

describe('overbooking EV', () => {
  it('sums risk scores and floors to the extra covers to sell', () => {
    const scores = [0.7, 0.05, 0.4];
    expect(expectedNoShows(scores)).toBeCloseTo(1.15, 5);
    expect(recommendExtraBookings(scores)).toBe(1);
  });

  it('treats missing scores as zero rather than inventing risk', () => {
    expect(recommendExtraBookings([0.9, null, undefined])).toBe(0);
  });

  it('does not recommend extra capacity when every guest is a sure show', () => {
    expect(recommendExtraBookings([0.05, 0.1, 0.08])).toBe(0);
  });

  it('subtracts extras already accepted from remaining capacity', () => {
    const summary = summariseOverbooking([
      { noShowRisk: 0.6, isOverbooked: false },
      { noShowRisk: 0.7, isOverbooked: true },
    ]);
    expect(summary.expectedNoShows).toBeCloseTo(1.3, 5);
    expect(summary.recommendedExtraBookings).toBe(1);
    expect(summary.extraAlreadyTaken).toBe(1);
    expect(summary.remainingExtra).toBe(0);
  });
});
