import { describe, expect, it } from 'vitest';
import {
  assignPartiesToTables,
  selectBestFitOrCombo,
  selectBestFitTable,
} from './tableAssignment.service.js';

const tables = [
  { id: 'a', label: 'T8', capacity: 6, combinable: false, combineGroup: null },
  { id: 'b', label: 'T4', capacity: 4, combinable: true, combineGroup: 'IN-4' },
  { id: 'c', label: 'T5', capacity: 4, combinable: true, combineGroup: 'IN-4' },
  { id: 'd', label: 'P1', capacity: 8, combinable: false, combineGroup: null },
];

describe('selectBestFitTable', () => {
  it('picks the smallest free table', () => {
    expect(selectBestFitTable(tables, new Set()).label).toBe('T4');
  });
});

describe('selectBestFitOrCombo', () => {
  it('prefers a single table over combining', () => {
    const pick = selectBestFitOrCombo(tables, new Set(), 4);
    expect(pick.combined).toBe(false);
    expect(pick.tables[0].label).toBe('T4');
  });

  it('combines two same-group tables when no single table fits', () => {
    const tiny = [
      { id: '1', label: 'T1', capacity: 2, combinable: true, combineGroup: 'IN-2' },
      { id: '2', label: 'T2', capacity: 2, combinable: true, combineGroup: 'IN-2' },
      { id: '3', label: 'BAR', capacity: 2, combinable: false, combineGroup: null },
    ];
    const pick = selectBestFitOrCombo(tiny, new Set(), 4);
    expect(pick.combined).toBe(true);
    expect(pick.tables.map((t) => t.label)).toEqual(['T1', 'T2']);
    expect(pick.wastedSeats).toBe(0);
  });

  it('returns null when combinable tables are in different groups', () => {
    const split = [
      { id: '1', label: 'T1', capacity: 2, combinable: true, combineGroup: 'A' },
      { id: '2', label: 'T2', capacity: 2, combinable: true, combineGroup: 'B' },
    ];
    expect(selectBestFitOrCombo(split, new Set(), 4)).toBeNull();
  });
});

describe('assignPartiesToTables', () => {
  it('seats largest parties first and leaves leftovers unassigned', () => {
    const parties = [
      { id: 'p2', partySize: 2, createdAt: '2026-08-01' },
      { id: 'p8', partySize: 8, createdAt: '2026-08-02' },
      { id: 'p6', partySize: 6, createdAt: '2026-08-03' },
      { id: 'p10', partySize: 10, createdAt: '2026-08-04' },
    ];
    const result = assignPartiesToTables(tables, parties);
    expect(result.assignments.map((a) => a.party.id)).toEqual(['p8', 'p6', 'p2']);
    expect(result.unassigned.map((p) => p.id)).toEqual(['p10']);
  });
});
