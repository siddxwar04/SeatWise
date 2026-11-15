import { describe, expect, it } from 'vitest';
import { bookingInterval, intervalsOverlap, localToUtc } from '../../lib/slots.js';
import { isDemoEmail, planDemoService } from './demo.service.js';

const date = '2026-08-05';
const tables = [
  { id: 't2a', capacity: 2 },
  { id: 't2b', capacity: 2 },
  { id: 't4a', capacity: 4 },
  { id: 't4b', capacity: 4 },
  { id: 't6', capacity: 6 },
];
const morning = localToUtc(date, '09:00');

function overlapsOnSameTable(rows) {
  const seated = rows.filter((r) => r.tableId);
  return seated.some((a, i) =>
    seated.some(
      (b, j) =>
        i < j &&
        a.tableId === b.tableId &&
        intervalsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt),
    ),
  );
}

describe('planDemoService', () => {
  it('fills every table at the peak seating and adds one overbooked party', () => {
    const plan = planDemoService({ date, tables, existing: [], now: morning });
    const peak = plan.filter((r) => r.time === '20:00');

    expect(new Set(peak.filter((r) => r.tableId).map((r) => r.tableId)).size).toBe(tables.length);
    expect(peak.filter((r) => r.isOverbooked)).toHaveLength(1);
    expect(peak.find((r) => r.isOverbooked).tableId).toBeNull();
  });

  it('never seats a party at a table too small for it, or two parties on one table at once', () => {
    const plan = planDemoService({ date, tables, existing: [], now: morning });
    const capacity = Object.fromEntries(tables.map((t) => [t.id, t.capacity]));

    for (const row of plan.filter((r) => r.tableId)) {
      expect(row.size).toBeLessThanOrEqual(capacity[row.tableId]);
    }
    expect(overlapsOnSameTable(plan)).toBe(false);
  });

  it('leaves a table alone when someone has already booked it', () => {
    const taken = { tableId: 't6', ...bookingInterval(date, '20:00') };
    const plan = planDemoService({ date, tables, existing: [taken], now: morning });

    expect(overlapsOnSameTable([...plan, taken])).toBe(false);
    expect(plan.filter((r) => r.time === '20:00' && r.tableId === 't6')).toHaveLength(0);
  });

  it('only plans seatings that have not started', () => {
    const evening = localToUtc(date, '20:40');
    const plan = planDemoService({ date, tables, existing: [], now: evening });

    expect(plan.length).toBeGreaterThan(0);
    for (const row of plan) expect(row.startsAt.getTime()).toBeGreaterThan(evening.getTime());
  });

  it('plans nothing once the last seating has gone', () => {
    const night = localToUtc(date, '23:30');
    expect(planDemoService({ date, tables, existing: [], now: night })).toEqual([]);
  });
});

describe('isDemoEmail', () => {
  it('recognises the shared accounts and nobody else', () => {
    expect(isDemoEmail('demo.owner@seatwise.app')).toBe(true);
    expect(isDemoEmail('Demo.Diner@SeatWise.app')).toBe(true);
    expect(isDemoEmail('someone@example.com')).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });
});
