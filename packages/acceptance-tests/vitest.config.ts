import { defineConfig } from 'vitest/config';
import MultiDriverReporter from '@yoink/acceptance-testing/reporter';

export default defineConfig({
  test: {
    include: ['src/use-cases/**/*.test.ts'],
    reporters: process.env.CI
      ? ['verbose', 'json', 'github-actions', new MultiDriverReporter()]
      : ['verbose', new MultiDriverReporter()],
    outputFile: {
      json: './test-results.json',
    },
    // Each test file runs in its own fork with isolated browser/tenant.
    // Files run in parallel, but tests within a file run sequentially.
    pool: 'forks',
  },
});
