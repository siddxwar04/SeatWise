import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBooking, searchVenues } from './marketplace.js';

vi.mock('./config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});

describe('searchVenues', () => {
  it('matches text within a city and does not leak venues from another city', async () => {
    const pune = await searchVenues({ city: 'pune', text: 'olive' });
    const slugs = pune.venues.map((v) => v.slug);

    expect(slugs).toContain('olive-and-grove');
    expect(pune.venues.every((v) => v.city === 'pune')).toBe(true);

    const mumbai = await searchVenues({ city: 'mumbai', text: 'olive' });
    expect(mumbai.venues.map((v) => v.slug)).not.toContain('olive-and-grove');
  });

  it('applies cuisine and area filters together', async () => {
    const result = await searchVenues({
      city: 'pune',
      cuisines: ['Mediterranean'],
      areas: ['Koregaon Park'],
    });
    const slugs = result.venues.map((v) => v.slug);

    expect(
      result.venues.every((v) => v.cuisine === 'Mediterranean' && v.area === 'Koregaon Park'),
    ).toBe(true);
    expect(slugs).toContain('olive-and-grove');
    expect(slugs).not.toContain('kite-and-string');
  });

  it('drops venues that cannot seat the party', async () => {
    const result = await searchVenues({ city: 'pune', party: 6 });
    const slugs = result.venues.map((v) => v.slug);

    expect(slugs).toContain('olive-and-grove');
    expect(slugs).not.toContain('kite-and-string');
    expect(result.venues.every((v) => v.bookable)).toBe(true);
  });

  it('keeps walk-in venues and excludes reservation-only rooms when that filter is on', async () => {
    const result = await searchVenues({ city: 'pune', quick: ['walkin'] });
    const slugs = result.venues.map((v) => v.slug);

    expect(slugs).toContain('forno-nove');
    expect(slugs).not.toContain('olive-and-grove');
    expect(result.venues.every((v) => v.walkIn)).toBe(true);
  });
});

describe('createBooking', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a diner-facing booking with a SeatWise reference', async () => {
    const booking = await createBooking({
      venueSlug: 'olive-and-grove',
      date: '2026-09-12',
      time: '20:00',
      partySize: 2,
      guest: { name: 'Aarav Sharma', phone: '9876543210' },
    });

    expect(booking.venueName).toBe('Olive & Grove');
    expect(booking.venueSlug).toBe('olive-and-grove');
    expect(booking.partySize).toBe(2);
    expect(booking.guest.name).toBe('Aarav Sharma');
    expect(booking.reference).toMatch(/^SW-[A-Z0-9]+$/);
    expect(['CONFIRMED', 'PENDING']).toContain(booking.status);
  });
});
