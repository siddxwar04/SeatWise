import { describe, expect, it } from 'vitest';
import { validateCreateMenuItem } from '../../../web/src/lib/menuValidation.js';

/**
 * Cross-package import of the web validation helper so API CI still covers
 * the client mirror of menu.schemas.js (empty sortOrder must not become NaN).
 */
describe('validateCreateMenuItem', () => {
  const base = {
    restaurantSlug: 'tastyfood-koramangala',
    slug: 'test-dish',
    name: 'Test Dish',
    description: 'A description that is long enough to pass validation.',
    price: 250,
    category: 'LUNCH',
    imageUrl: '/images/menu-grill.webp',
    imageAlt: 'Test dish',
    allergens: [],
    dietaryTags: [],
  };

  it('accepts a missing/blank sortOrder as 0', () => {
    const result = validateCreateMenuItem({ ...base, sortOrder: '' });
    expect(result.ok).toBe(true);
    expect(result.data.sortOrder).toBe(0);
  });

  it('rejects a non-integer sortOrder', () => {
    const result = validateCreateMenuItem({ ...base, sortOrder: '1.5' });
    expect(result.ok).toBe(false);
    expect(result.errors.sortOrder).toBeTruthy();
  });
});
