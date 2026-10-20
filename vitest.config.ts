import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/*/test/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
