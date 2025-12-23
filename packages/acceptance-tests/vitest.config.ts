import { defineConfig } from 'vitest/config';
import MultiDriverReporter from './src/reporter.js';

export default defineConfig({
  test: {
    // Include both unit tests and acceptance tests
    include: ['src/**/*.test.ts'],
    // Only use custom reporter for acceptance tests (use-cases)
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
