import { describe, expect, it } from 'vitest';
import { selectBestFitTable } from './booking.service.js';

/**
 * Best-fit table selection is the interview centerpiece of the booking engine:
 * seat the party at the smallest free table that fits, so larger tables stay
 * available for larger parties (bin-packing intuition).
 */
describe('selectBestFitTable', () => {
  const tables = [
    { id: 'a', label: 'T8', capacity: 6 },
    { id: 'b', label: 'T4', capacity: 4 },
    { id: 'c', label: 'T5', capacity: 4 },
    { id: 'd', label: 'P1', capacity: 8 },
  ];

  it('picks the smallest free table that can seat the party', () => {
    const pick = selectBestFitTable(tables, new Set());
    // With no party size filter applied upstream, best-fit among all candidates
    // is the lowest capacity — and on a tie, the earliest label.
    expect(pick).toEqual({ id: 'b', label: 'T4', capacity: 4 });
  });

  it('skips busy tables and still prefers the tightest fit', () => {
    const pick = selectBestFitTable(tables, new Set(['b']));
    expect(pick).toEqual({ id: 'c', label: 'T5', capacity: 4 });
  });

  it('returns null when every candidate is busy', () => {
    const pick = selectBestFitTable(tables, new Set(['a', 'b', 'c', 'd']));
    expect(pick).toBeNull();
  });

  it('breaks capacity ties on label for deterministic allocation', () => {
    const twins = [
      { id: '1', label: 'T6', capacity: 4 },
      { id: '2', label: 'T4', capacity: 4 },
    ];
    expect(selectBestFitTable(twins, new Set()).label).toBe('T4');
  });
});
