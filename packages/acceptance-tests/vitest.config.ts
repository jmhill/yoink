import { defineConfig } from 'vitest/config';
import MultiDriverReporter from '@yoink/acceptance-testing/reporter';

export default defineConfig({
  test: {
    include: ['src/use-cases/**/*.test.ts'],
    // Playwright createActor runs in beforeEach (org + invitation + passkey
    // signup + admin name PATCH). Typical 2–3s; under a full parallel CI suite
    // it can exceed Vitest's 10s hook default. Keep hook and test budgets
    // aligned — this is the actor-setup budget, not a blanket hang allowance.
    testTimeout: 30000,
    hookTimeout: 30000,
    // CI: Use verbose output + github-actions annotations + markdown table for PR summary
    // Local: Use default reporter + JSON for easy failure analysis
    reporters: process.env.CI
      ? ['verbose', 'json', 'github-actions', new MultiDriverReporter()]
      : ['default', 'json'],
    outputFile: {
      json: './test-results.json',
    },
    // Each test file runs in its own fork with isolated browser/tenant.
    // Files run in parallel, but tests within a file run sequentially.
    pool: 'forks',
  },
});
