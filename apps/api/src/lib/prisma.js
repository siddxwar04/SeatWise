import { PrismaClient } from '@prisma/client';
import { isProduction, isTest } from '../config/env.js';

/**
 * A single PrismaClient for the process. Prisma manages the underlying
 * connection pool; constructing a client per request would exhaust Postgres
 * connections under load — the same reason the legacy code opening a fresh
 * mysqli connection in every script was a scalability dead end.
 *
 * Cached on globalThis so `node --watch` restarts reuse the pool instead of
 * leaking a new one on every file save.
 */
export const prisma =
  globalThis.__tastyfoodPrisma ??
  new PrismaClient({
    log: isTest ? [] : isProduction ? ['error'] : ['error', 'warn'],
  });

if (!isProduction) {
  globalThis.__tastyfoodPrisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
