import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

const restaurantListSelect = {
  id: true,
  slug: true,
  name: true,
  address: true,
  phone: true,
  cuisine: true,
  priceLevel: true,
  vibeTags: true,
  city: true,
  area: true,
  ratingAvg: true,
  ratingCount: true,
  tagline: true,
  about: true,
  signatures: true,
  curated: true,
  bookingType: true,
  walkIn: true,
  prepaidPaise: true,
  policy: true,
};

/**
 * Resolves a restaurant from an id and/or public slug.
 *
 * Public APIs speak in slugs (URL-safe, stable); admin tooling may pass UUIDs.
 * Every menu / availability / booking path must go through this so a missing
 * restaurant becomes a clean error rather than an unscoped query across all
 * venues.
 */
export async function resolveRestaurant({ restaurantId, restaurantSlug } = {}) {
  if (!restaurantId && !restaurantSlug) {
    // Client forgot the venue key — that is a bad request, not a missing row.
    throw new BadRequestError('Restaurant is required.');
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: {
      isActive: true,
      ...(restaurantId ? { id: restaurantId } : {}),
      ...(restaurantSlug ? { slug: restaurantSlug } : {}),
    },
  });

  if (!restaurant) {
    throw new NotFoundError('That restaurant was not found.');
  }

  return restaurant;
}

export async function listActiveRestaurants() {
  return prisma.restaurant.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: restaurantListSelect,
  });
}

export async function getRestaurantBySlug(slug) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: restaurantListSelect,
  });
  if (!restaurant) throw new NotFoundError('That restaurant was not found.');
  return attachSignaturePrices(restaurant);
}

/**
 * Venue-page signatures are marketing names (String[]). Attach MenuItem prices
 * when the names match so diners see ₹ amounts next to dishes without a second
 * round-trip. Unmatched names keep `priceInPaise: null` — the UI hides the price.
 */
async function attachSignaturePrices(restaurant) {
  const names = restaurant.signatures ?? [];
  if (names.length === 0) {
    return { ...restaurant, signatures: [] };
  }

  const items = await prisma.menuItem.findMany({
    where: {
      restaurantId: restaurant.id,
      isAvailable: true,
      name: { in: names, mode: 'insensitive' },
    },
    select: { name: true, priceInPaise: true },
  });

  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item.priceInPaise]));

  return {
    ...restaurant,
    // Keep the raw string array for list/search clients; add priced dishes for
    // the venue page. Frontends that only read `signatures` as strings still work.
    signatures: names,
    signatureDishes: names.map((name) => ({
      name,
      priceInPaise: byName.get(name.toLowerCase()) ?? null,
    })),
  };
}

/**
 * True when the user is a global ADMIN or has a RestaurantAdmin row for this
 * venue. Used by requireRestaurantAdmin and by services that need an inline
 * ownership check without going through Express middleware again.
 */
export async function isRestaurantAdmin(userId, restaurantId, role) {
  // Platform operators manage every venue without a join-table row each —
  // otherwise onboarding a new restaurant would require re-seeding ADMIN
  // memberships. Venue staff are scoped strictly via RestaurantAdmin.
  if (role === 'ADMIN') return true;

  const membership = await prisma.restaurantAdmin.findUnique({
    where: {
      userId_restaurantId: { userId, restaurantId },
    },
    select: { id: true },
  });

  return Boolean(membership);
}

function slugify(value) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return base || 'restaurant';
}

async function uniqueSlug(base) {
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop -- collisions are rare; a loop over a handful of names beats a clever query.
  while (await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

/**
 * A small, mixed-capacity starter floor so a freshly listed restaurant is
 * immediately bookable — nobody wants to onboard into an empty room with
 * "no table that seats 2" on every request.
 */
const STARTER_TABLES = [
  { label: 'T1', capacity: 2, zone: 'INDOOR' },
  { label: 'T2', capacity: 2, zone: 'INDOOR' },
  { label: 'T3', capacity: 4, zone: 'INDOOR' },
  { label: 'T4', capacity: 4, zone: 'INDOOR' },
  { label: 'T5', capacity: 6, zone: 'INDOOR' },
  { label: 'P1', capacity: 4, zone: 'OUTDOOR' },
];

/**
 * Self-serve owner onboarding. Creates the restaurant, a starter floor, and
 * the RestaurantAdmin row linking it to the caller — all in one transaction,
 * so the owner console has something real to show the instant this returns.
 */
export async function createRestaurant(input, ownerUserId) {
  const slug = await uniqueSlug(slugify(input.name));

  const restaurant = await prisma.$transaction(async (tx) => {
    const created = await tx.restaurant.create({
      data: {
        slug,
        name: input.name,
        address: input.address,
        phone: input.phone,
        cuisine: input.cuisine ?? 'Indian',
        priceLevel: input.priceLevel ?? 2,
        city: input.city,
        area: input.area,
        tagline: input.tagline ?? null,
        about: input.about ?? null,
      },
    });

    await tx.restaurantAdmin.create({
      data: { userId: ownerUserId, restaurantId: created.id },
    });

    await tx.restaurantTable.createMany({
      data: STARTER_TABLES.map((table) => ({ ...table, restaurantId: created.id })),
    });

    return created;
  }, { timeout: 10_000, maxWait: 5_000 });

  logger.info({ restaurantId: restaurant.id, ownerUserId, slug }, 'restaurant self-registered');
  return { ...restaurant, signatures: [], signatureDishes: [] };
}

/**
 * Venues the signed-in user may administer.
 *
 * Global ADMIN → every active restaurant (same directory as the public list).
 * Everyone else → active restaurants linked via RestaurantAdmin. Empty list
 * means the user has no staff access; the frontend uses that to hide /admin.
 */
export async function listManagedRestaurants(userId, role) {
  if (role === 'ADMIN') {
    return prisma.restaurant.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: restaurantListSelect,
    });
  }

  return prisma.restaurant.findMany({
    where: {
      isActive: true,
      admins: { some: { userId } },
    },
    orderBy: { name: 'asc' },
    select: restaurantListSelect,
  });
}
