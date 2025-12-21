import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'web',
      root: import.meta.dirname,
      environment: 'jsdom',
      alias: {
        'virtual:pwa-register/react': path.resolve(
          import.meta.dirname,
          './src/lib/__mocks__/pwa-register-react.ts'
        ),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  })
);
