/**
 * Airline-style expected-value overbooking.
 *
 *   expectedNoShows(slot) = Σ riskScore(booking)
 *   recommendedExtra      = floor(expectedNoShows)
 *
 * Pure arithmetic lives here so the HTTP layer, the cache, and the booking
 * engine share one definition. A booking with a missing score contributes 0
 * — we never invent risk just to open extra covers.
 *
 * Database/cache/slot access is dynamically imported so unit tests of the
 * math do not boot env/Redis/Prisma.
 */

export function expectedNoShows(riskScores) {
  return riskScores.reduce((sum, score) => {
    const n = Number(score);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function recommendExtraBookings(riskScores) {
  return Math.floor(expectedNoShows(riskScores));
}

export function summariseOverbooking(bookings) {
  const scores = bookings.map((b) => b.noShowRisk);
  const expected = expectedNoShows(scores);
  const recommendedExtraBookings = Math.floor(expected);
  const extraAlreadyTaken = bookings.filter((b) => b.isOverbooked).length;
  const remainingExtra = Math.max(0, recommendedExtraBookings - extraAlreadyTaken);

  return {
    bookingCount: bookings.length,
    expectedNoShows: Number(expected.toFixed(3)),
    recommendedExtraBookings,
    extraAlreadyTaken,
    remainingExtra,
  };
}

/** Day of slot recommendations, cached ~20s and dropped on every booking write. */
export async function getDayOverbooking(restaurantId, dateStr) {
  const { CACHE_KEYS, cached } = await import('../../lib/cache.js');
  const { prisma } = await import('../../lib/prisma.js');
  const { bookingInterval, generateSlots, intervalsOverlap, serviceDateFor } =
    await import('../../lib/slots.js');

  return cached(CACHE_KEYS.overbookingDay(restaurantId, dateStr), 20, async () => {
    const bookings = await prisma.reservation.findMany({
      where: {
        restaurantId,
        serviceDate: serviceDateFor(dateStr),
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
      },
      select: { startsAt: true, endsAt: true, noShowRisk: true, isOverbooked: true },
    });

    return generateSlots().map((time) => {
      const { startsAt, endsAt } = bookingInterval(dateStr, time);
      const inSlot = bookings.filter((b) => intervalsOverlap(b.startsAt, b.endsAt, startsAt, endsAt));
      return {
        restaurantId,
        date: dateStr,
        time,
        ...summariseOverbooking(inSlot),
      };
    });
  });
}

export async function getSlotOverbooking(restaurantId, dateStr, time) {
  const day = await getDayOverbooking(restaurantId, dateStr);
  return (
    day.find((slot) => slot.time === time) ?? {
      restaurantId,
      date: dateStr,
      time,
      ...summariseOverbooking([]),
    }
  );
}
