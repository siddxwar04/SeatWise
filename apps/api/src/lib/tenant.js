import { prisma } from './prisma.js';

/**
 * Runs `work` inside a transaction after SET LOCAL of the tenant GUC.
 *
 * Postgres RLS policies on reservations / tables / waitlist / menu_items
 * match `restaurant_id = current_setting('app.current_restaurant_id')`.
 * SET LOCAL is transaction-scoped, so it cannot leak onto the next request
 * that happens to reuse the pooled connection.
 *
 * The table-owner DATABASE_URL used in local/Neon bypasses RLS until FORCE
 * is enabled; this still keeps every owner-facing write on the path a
 * non-owner role would need in production.
 */
export async function withTenant(restaurantId, work) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_restaurant_id', ${restaurantId}, true)`;
    return work(tx);
  });
}

/** Same SET LOCAL for a transaction the caller already opened (booking lock). */
export async function setTenantGuc(tx, restaurantId) {
  await tx.$executeRaw`SELECT set_config('app.current_restaurant_id', ${restaurantId}, true)`;
}
