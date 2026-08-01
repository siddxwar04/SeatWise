import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';
import { disconnectRedis, getRedis } from './lib/redis.js';

async function main() {
  // Verify the database before binding the port. Failing here produces one
  // clear error at boot instead of a 500 on the first real request.
  await prisma.$queryRaw`SELECT 1`;
  logger.info('database connected');

  getRedis();

  const app = createApp();
  const server = app.listen(env.API_PORT, () => {
    logger.info(`TastyFood API listening on http://localhost:${env.API_PORT}`);
  });

  /**
   * Graceful shutdown: stop accepting new connections, let in-flight requests
   * finish, then release the pools. Without this, a deploy can kill a request
   * midway through a booking transaction.
   */
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out after 10s — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
      logger.info('shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception — exiting');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start API');
  process.exit(1);
});
