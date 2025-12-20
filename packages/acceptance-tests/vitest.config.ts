import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/use-cases/**/*.test.ts'],
  },
});
