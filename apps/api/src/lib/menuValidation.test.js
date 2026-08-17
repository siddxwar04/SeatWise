import { describe, expect, it } from 'vitest';
import { validateCreateMenuItem } from './menuValidation.js';

/**
 * Shared menu-payload validator. It used to live in the web workspace and be
 * imported across packages; the web app no longer renders a menu editor, so the
 * helper moved here — next to menu.schemas.js, which it mirrors — rather than
 * being deleted along with the UI that happened to be its first caller.
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
