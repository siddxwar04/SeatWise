import { describe, expect, it } from 'vitest';
import { cuisineHints, distanceMeters, extractPlace, toNearbyResults } from './places.js';

describe('extractPlace', () => {
  it.each([
    ['Italian near Koregaon Park for two', 'Koregaon Park'],
    ['somewhere good in Bandra West tonight', 'Bandra West'],
    ['cafes around Indiranagar', 'Indiranagar'],
    ['best biryani close to Banjara Hills, under 800', 'Banjara Hills'],
    ['dinner in Hauz Khas?', 'Hauz Khas'],
  ])('%s → %s', (message, place) => {
    expect(extractPlace(message)).toBe(place);
  });

  it.each([
    'Italian for two tonight under 1500',
    'table for 4 at 8pm',
    'something quiet in the evening',
    'I am in a hurry',
    'outdoor table for 6 tonight',
  ])('finds no place in: %s', (message) => {
    expect(extractPlace(message)).toBeNull();
  });
});

describe('cuisineHints', () => {
  it('maps what the guest typed to OpenStreetMap cuisine values', () => {
    expect(cuisineHints('Italian near Koregaon Park')).toContain('pizza');
    expect(cuisineHints('table near Baner')).toEqual([]);
  });
});

describe('toNearbyResults', () => {
  const origin = { lat: 18.5362, lon: 73.8939 };
  const el = (name, dLat, tags = {}) => ({
    lat: origin.lat + dLat,
    lon: origin.lon,
    tags: { name, amenity: 'restaurant', ...tags },
  });

  it('puts cuisine matches first, then nearest, and drops unnamed or duplicate places', () => {
    const results = toNearbyResults(
      [
        el('Far Pizza', 0.009, { cuisine: 'pizza;italian' }),
        el('Near Curry', 0.001, { cuisine: 'indian' }),
        el('Near Curry', 0.002),
        { lat: origin.lat, lon: origin.lon, tags: { amenity: 'restaurant' } },
        {
          center: { lat: origin.lat + 0.003, lon: origin.lon },
          tags: { name: 'Corner Cafe', amenity: 'cafe' },
        },
      ],
      origin,
      ['italian', 'pizza'],
    );

    expect(results.map((r) => r.name)).toEqual(['Far Pizza', 'Near Curry', 'Corner Cafe']);
    expect(results[0].cuisine).toBe('Pizza, Italian');
    expect(results[2].kind).toBe('Cafe');
    expect(results[0]).not.toHaveProperty('matchesCuisine');
    // Name as the search, map centred on the place — not coordinates in the text.
    expect(
      results[1].mapUrl.startsWith('https://www.google.com/maps/search/Near%20Curry/@18.537'),
    ).toBe(true);
    expect(results[1].mapUrl.endsWith(',73.8939,17z')).toBe(true);
  });

  it('never returns more than five places', () => {
    const many = Array.from({ length: 12 }, (_, i) => el(`Place ${i}`, i * 0.0005));
    expect(toNearbyResults(many, origin)).toHaveLength(5);
  });
});

describe('distanceMeters', () => {
  it('is about 111 m per thousandth of a degree of latitude', () => {
    const d = distanceMeters({ lat: 18.5, lon: 73.9 }, { lat: 18.501, lon: 73.9 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });
});
