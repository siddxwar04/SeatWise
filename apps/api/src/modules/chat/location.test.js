import { describe, expect, it } from 'vitest';
import { locationBlock, locationKnown } from './chat.service.js';

const place = { name: 'Toscano', cuisine: 'Italian', distanceMeters: 550 };

describe('how the concierge treats a named location', () => {
  it('no place named: nothing is added and the usual fallback cards apply', () => {
    expect(locationBlock(null)).toBeNull();
    expect(locationKnown(null)).toBe(false);
  });

  it('real places found: they are listed and marked as not bookable', () => {
    const block = locationBlock({ status: 'ok', place: 'Koregaon Park', results: [place] });
    expect(block).toContain('LOCATION: the guest asked about Koregaon Park.');
    expect(block).toContain('NOT SeatWise partners');
    expect(block).toContain('- Toscano (Italian), 550 m away');
  });

  it.each(['unavailable', 'empty'])(
    'lookup %s: the model still knows the location but is told to list no real places',
    (status) => {
      const nearby = { status, place: 'Andheri', results: [] };
      const block = locationBlock(nearby);
      expect(block).toContain('LOCATION: the guest asked about Andheri.');
      expect(block).toContain('none could be loaded');
      // …and unrelated restaurants are not shown as a consolation.
      expect(locationKnown(nearby)).toBe(true);
    },
  );

  it('unrecognised place: treated as if no place was named', () => {
    const nearby = { status: 'not_found', place: 'good company', results: [] };
    expect(locationBlock(nearby)).toBeNull();
    expect(locationKnown(nearby)).toBe(false);
  });
});
