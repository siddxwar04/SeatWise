import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Env is loaded by src/config/env.js from the repo-root .env.
    fileParallelism: false,
  },
});
