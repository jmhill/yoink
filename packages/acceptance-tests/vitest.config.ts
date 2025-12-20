import { defineConfig } from 'vitest/config';
import MultiDriverReporter from './src/reporter.js';

export default defineConfig({
  test: {
    include: ['src/use-cases/**/*.test.ts'],
    reporters: process.env.CI
      ? ['verbose', 'json', 'github-actions', new MultiDriverReporter()]
      : ['verbose', new MultiDriverReporter()],
    outputFile: {
      json: './test-results.json',
    },
    // Run tests sequentially to avoid browser context conflicts
    // when running Playwright tests alongside HTTP tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
