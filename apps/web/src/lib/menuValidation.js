/**
 * Client-side mirrors of apps/api/src/modules/menu/menu.schemas.js.
 *
 * Kept in sync manually (same enums, lengths, and regexes) so the form
 * rejects bad input before the round-trip. Server Zod remains authoritative.
 */

export const MENU_ALLERGENS = [
  'GLUTEN',
  'DAIRY',
  'EGG',
  'PEANUT',
  'TREE_NUT',
  'SOY',
  'FISH',
  'SHELLFISH',
  'SESAME',
];

export const MENU_DIETARY_TAGS = [
  'VEGETARIAN',
  'VEGAN',
  'JAIN',
  'HALAL',
  'CONTAINS_EGG',
  'NON_VEGETARIAN',
  'SPICY',
];

export const MENU_CATEGORIES = ['BREAKFAST', 'LUNCH', 'DESSERT'];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isEnumMember(list, value) {
  return list.includes(value);
}

function filterEnumList(list, values) {
  if (!Array.isArray(values)) return [];
  return values.filter((v) => isEnumMember(list, v));
}

/**
 * Validates a create payload. Returns { ok: true, data } or
 * { ok: false, errors: { field: message } } matching ApiError.details shape.
 */
export function validateCreateMenuItem(input) {
  const errors = {};
  const restaurantSlug = String(input.restaurantSlug ?? '')
    .trim()
    .toLowerCase();
  const slug = String(input.slug ?? '')
    .trim()
    .toLowerCase();
  const name = String(input.name ?? '').trim();
  const description = String(input.description ?? '').trim();
  const imageUrl = String(input.imageUrl ?? '').trim();
  const imageAlt = String(input.imageAlt ?? '').trim();
  const category = String(input.category ?? '')
    .trim()
    .toUpperCase();
  const price = Number(input.price);
  // Coerce like Zod (z.coerce.number): "" / undefined become 0 so the form's
  // default sortOrder does not fail Number.isInteger(NaN) after a cleared input.
  const rawSort = input.sortOrder;
  const sortOrder =
    rawSort === '' || rawSort === null || rawSort === undefined ? 0 : Number(rawSort);
  const allergens = filterEnumList(MENU_ALLERGENS, input.allergens ?? []);
  const dietaryTags = filterEnumList(MENU_DIETARY_TAGS, input.dietaryTags ?? []);
  const isAvailable = input.isAvailable === undefined ? true : Boolean(input.isAvailable);

  if (restaurantSlug.length < 2 || restaurantSlug.length > 80 || !SLUG_RE.test(restaurantSlug)) {
    errors.restaurantSlug = 'Restaurant slug must be lowercase hyphenated words';
  }
  if (slug.length < 2 || slug.length > 80 || !SLUG_RE.test(slug)) {
    errors.slug = 'Slug must be lowercase words separated by hyphens';
  }
  if (name.length < 2 || name.length > 120) {
    errors.name = 'Name must be between 2 and 120 characters';
  }
  if (description.length < 10 || description.length > 600) {
    errors.description = 'Description must be between 10 and 600 characters';
  }
  if (!Number.isFinite(price) || price <= 0 || price > 100_000) {
    errors.price = 'Price must be greater than zero';
  }
  if (!MENU_CATEGORIES.includes(category)) {
    errors.category = 'Pick a valid category';
  }
  if (!imageUrl || imageUrl.length > 255) {
    errors.imageUrl = 'Image URL is required';
  }
  if (imageAlt.length < 2 || imageAlt.length > 160) {
    errors.imageAlt = 'Alt text must be between 2 and 160 characters';
  }
  if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = 'Sort order must be a non-negative integer';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      restaurantSlug,
      slug,
      name,
      description,
      price,
      category,
      imageUrl,
      imageAlt,
      allergens,
      dietaryTags,
      isAvailable,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
  };
}

/**
 * Validates a partial update payload (same fields as create, minus restaurantSlug).
 * Empty / unchanged fields are still validated when present.
 */
export function validateUpdateMenuItem(input) {
  const errors = {};
  const data = {};

  if (input.slug !== undefined) {
    const slug = String(input.slug).trim().toLowerCase();
    if (slug.length < 2 || slug.length > 80 || !SLUG_RE.test(slug)) {
      errors.slug = 'Slug must be lowercase words separated by hyphens';
    } else {
      data.slug = slug;
    }
  }
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (name.length < 2 || name.length > 120) {
      errors.name = 'Name must be between 2 and 120 characters';
    } else {
      data.name = name;
    }
  }
  if (input.description !== undefined) {
    const description = String(input.description).trim();
    if (description.length < 10 || description.length > 600) {
      errors.description = 'Description must be between 10 and 600 characters';
    } else {
      data.description = description;
    }
  }
  if (input.price !== undefined && input.price !== '') {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100_000) {
      errors.price = 'Price must be greater than zero';
    } else {
      data.price = price;
    }
  }
  if (input.category !== undefined) {
    const category = String(input.category).trim().toUpperCase();
    if (!MENU_CATEGORIES.includes(category)) {
      errors.category = 'Pick a valid category';
    } else {
      data.category = category;
    }
  }
  if (input.imageUrl !== undefined) {
    const imageUrl = String(input.imageUrl).trim();
    if (!imageUrl || imageUrl.length > 255) {
      errors.imageUrl = 'Image URL is required';
    } else {
      data.imageUrl = imageUrl;
    }
  }
  if (input.imageAlt !== undefined) {
    const imageAlt = String(input.imageAlt).trim();
    if (imageAlt.length < 2 || imageAlt.length > 160) {
      errors.imageAlt = 'Alt text must be between 2 and 160 characters';
    } else {
      data.imageAlt = imageAlt;
    }
  }
  if (input.allergens !== undefined) {
    data.allergens = filterEnumList(MENU_ALLERGENS, input.allergens);
  }
  if (input.dietaryTags !== undefined) {
    data.dietaryTags = filterEnumList(MENU_DIETARY_TAGS, input.dietaryTags);
  }
  if (input.isAvailable !== undefined) {
    data.isAvailable = Boolean(input.isAvailable);
  }
  if (input.sortOrder !== undefined && input.sortOrder !== '') {
    const sortOrder = Number(input.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      errors.sortOrder = 'Sort order must be a non-negative integer';
    } else {
      data.sortOrder = sortOrder;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data };
}
