import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export const sharedConfig = defineConfig({
  test: {
    globals: true,
    setupFiles: [fileURLToPath(new URL('./scripts/vitest-failure-diagnostics.ts', import.meta.url))],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
      ],
    },
  },
});
