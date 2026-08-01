import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the real-Postgres concurrency suite only.
 * Loads whatever DATABASE_URL dotenv-cli injected (see .env.test).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.concurrency.test.js'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
