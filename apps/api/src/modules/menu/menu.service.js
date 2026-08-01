import { NotFoundError } from '../../errors/AppError.js';
import { CACHE_KEYS, cached, invalidatePrefix } from '../../lib/cache.js';
import { prisma } from '../../lib/prisma.js';

/** Ten minutes. Menus change rarely, and every write invalidates explicitly. */
const MENU_TTL_SECONDS = 600;

/**
 * Prices are stored as integer paise and formatted here, once.
 *
 * Money as a float is a classic source of off-by-a-paisa bugs; storing the
 * smallest unit as an integer removes the problem entirely. The formatted
 * string matches the legacy markup exactly — "₹850", no decimals.
 */
function toPublicMenuItem(item) {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    price: item.priceInPaise / 100,
    priceLabel: `₹${Math.round(item.priceInPaise / 100)}`,
    category: item.category,
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    allergens: item.allergens,
    dietaryTags: item.dietaryTags,
    isAvailable: item.isAvailable,
  };
}

/**
 * The whole menu.
 *
 * This replaces twelve near-identical nine-line HTML blocks that had to be
 * edited and redeployed to change a price. It is also what makes the category
 * tabs work: the audit found four styled tab buttons with no JavaScript and no
 * data layer behind them to filter.
 */
export async function listMenu({ category, includeUnavailable = false } = {}) {
  const key = category ? CACHE_KEYS.menuByCategory(category) : CACHE_KEYS.menuAll;

  // Admin views ask for unavailable items too; those bypass the cache rather
  // than polluting it with a second variant of every key.
  if (includeUnavailable) {
    return loadMenu({ category, includeUnavailable });
  }

  return cached(key, MENU_TTL_SECONDS, () => loadMenu({ category, includeUnavailable }));
}

async function loadMenu({ category, includeUnavailable }) {
  const items = await prisma.menuItem.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(includeUnavailable ? {} : { isAvailable: true }),
    },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  return items.map(toPublicMenuItem);
}

export async function getBySlug(slug) {
  const item = await prisma.menuItem.findUnique({ where: { slug } });
  if (!item) throw new NotFoundError('That dish is not on the menu.');
  return toPublicMenuItem(item);
}

/**
 * Allergen-safe filtering.
 *
 * This is a hard SQL predicate, and it is the function the Phase 8 assistant
 * calls before the language model ever sees a candidate list. An LLM asked to
 * "be careful about nut allergies" will eventually get it wrong; a NOT-overlaps
 * clause will not. The model's job is to phrase an answer about an already-safe
 * set, never to decide what is safe.
 */
export async function findSafeItems({ excludeAllergens = [], requireTags = [], category } = {}) {
  const items = await prisma.menuItem.findMany({
    where: {
      isAvailable: true,
      ...(category ? { category } : {}),
      // hasSome + NOT: exclude any dish containing ANY of the listed allergens.
      ...(excludeAllergens.length > 0
        ? { NOT: { allergens: { hasSome: excludeAllergens } } }
        : {}),
      // hasEvery: the dish must carry ALL requested dietary tags.
      ...(requireTags.length > 0 ? { dietaryTags: { hasEvery: requireTags } } : {}),
    },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });

  return items.map(toPublicMenuItem);
}

// --- admin writes -----------------------------------------------------------

export async function createMenuItem(data) {
  const { price, ...rest } = data;
  const item = await prisma.menuItem.create({
    data: { ...rest, priceInPaise: Math.round(price * 100) },
  });
  await invalidatePrefix(CACHE_KEYS.menuPrefix);
  return toPublicMenuItem(item);
}

export async function updateMenuItem(id, data) {
  const { price, ...rest } = data;
  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      ...rest,
      ...(price !== undefined ? { priceInPaise: Math.round(price * 100) } : {}),
    },
  });
  await invalidatePrefix(CACHE_KEYS.menuPrefix);
  return toPublicMenuItem(item);
}

export async function deleteMenuItem(id) {
  await prisma.menuItem.delete({ where: { id } });
  await invalidatePrefix(CACHE_KEYS.menuPrefix);
}

/** Soft toggle — "86 the lava cake" without losing its row and its history. */
export async function setAvailability(id, isAvailable) {
  const item = await prisma.menuItem.update({ where: { id }, data: { isAvailable } });
  await invalidatePrefix(CACHE_KEYS.menuPrefix);
  return toPublicMenuItem(item);
}
