import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared.js';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'api',
      root: import.meta.dirname,
      // These helpers are `*.test.ts` so the table-ownership walker skips
      // their SQL. They export functions other tests import. A suite in the
      // file would run again inside every importer, and Vitest rejects a
      // collected file that has no suite, so they are not test entries.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
        'src/tests/helpers/migration-seed.test.ts',
        'src/tests/helpers/seed-test-user-session.test.ts',
      ],
    },
  })
);
