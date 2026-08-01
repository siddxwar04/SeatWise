import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import { prisma } from '../../lib/prisma.js';

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
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      phone: true,
    },
  });
}

export async function getRestaurantBySlug(slug) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      phone: true,
    },
  });
  if (!restaurant) throw new NotFoundError('That restaurant was not found.');
  return restaurant;
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

const restaurantListSelect = {
  id: true,
  slug: true,
  name: true,
  address: true,
  phone: true,
};

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
