import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/use-cases/**/*.test.ts'],
    reporters: process.env.CI
      ? ['verbose', 'json', 'github-actions']
      : ['verbose'],
    outputFile: {
      json: './test-results.json',
    },
  },
});
