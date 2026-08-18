import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import { prisma } from '../../lib/prisma.js';
import { resolveRestaurant } from '../restaurants/restaurant.service.js';

export async function listReviews(restaurantSlug, { page = 1, pageSize = 10 } = {}) {
  const restaurant = await resolveRestaurant({ restaurantSlug });

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, authorName: true, stars: true, body: true, createdAt: true },
    }),
    prisma.review.count({ where: { restaurantId: restaurant.id } }),
  ]);

  return {
    reviews,
    total,
    page,
    pageSize,
    ratingAvg: restaurant.ratingAvg,
    ratingCount: restaurant.ratingCount,
  };
}

/**
 * Only the diner who held the reservation may review it, and only once the
 * visit actually happened — no reviewing a no-show, and (unique constraint on
 * reservationId) no reviewing the same visit twice.
 *
 * The rating aggregate is recomputed from the real rows inside the same
 * transaction as the insert, not hand-incremented — see the ratingAvg field
 * comment in schema.prisma for why.
 */
export async function createReview(userId, { reservationId, stars, body }) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      userId: true,
      guestName: true,
      restaurantId: true,
      status: true,
      review: { select: { id: true } },
    },
  });

  if (!reservation) throw new NotFoundError('That reservation was not found.');
  if (reservation.userId !== userId) {
    throw new ForbiddenError('You can only review your own reservations.');
  }
  if (reservation.status !== 'COMPLETED') {
    throw new BadRequestError('You can review a visit once it has been completed.');
  }
  if (reservation.review) {
    throw new ConflictError('This visit has already been reviewed.');
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        restaurantId: reservation.restaurantId,
        reservationId: reservation.id,
        userId,
        authorName: reservation.guestName,
        stars,
        body: body ?? null,
      },
    });

    const aggregate = await tx.review.aggregate({
      where: { restaurantId: reservation.restaurantId },
      _avg: { stars: true },
      _count: true,
    });

    await tx.restaurant.update({
      where: { id: reservation.restaurantId },
      data: {
        ratingAvg: aggregate._avg.stars ?? 0,
        ratingCount: aggregate._count,
      },
    });

    return review;
  });
}
