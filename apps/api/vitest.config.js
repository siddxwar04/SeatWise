import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Real-Postgres concurrency proof — run via `npm run test:concurrency` only.
    exclude: ['src/**/*.concurrency.test.js'],
    fileParallelism: false,
  },
});
