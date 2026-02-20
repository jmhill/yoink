import path from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';
import baseConfig from '../../eslint.config.base.js';

const elements = [
  { type: 'admin', pattern: 'src/admin/**' },
  { type: 'auth', pattern: 'src/auth/**' },
  { type: 'captures', pattern: 'src/captures/**' },
  { type: 'config', pattern: 'src/config/**' },
  { type: 'database', pattern: 'src/database/**' },
  { type: 'health', pattern: 'src/health/**' },
  { type: 'invitations', pattern: 'src/invitations/**' },
  { type: 'logging', pattern: 'src/logging/**' },
  { type: 'organizations', pattern: 'src/organizations/**' },
  { type: 'processing', pattern: 'src/processing/**' },
  { type: 'shared', pattern: 'src/shared/**' },
  { type: 'tasks', pattern: 'src/tasks/**' },
  { type: 'users', pattern: 'src/users/**' },
  { type: 'app', pattern: 'src/app.ts' },
  { type: 'composition', pattern: 'src/composition-root.ts' },
  { type: 'entrypoint', pattern: 'src/index.ts' },
  { type: 'entrypoint', pattern: 'src/instrument.ts' },
  { type: 'entrypoint', pattern: 'src/migrate.ts' },
  { type: 'entrypoint', pattern: 'src/test-migrations.ts' },
  { type: 'tests', pattern: 'src/**/*.test.ts' },
];

const rootPath = path.dirname(fileURLToPath(import.meta.url));

export default [
  ...baseConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/root-path': rootPath,
      'boundaries/include': ['src/**/*.{ts,tsx}'],
      'boundaries/elements': elements,
    },
    rules: {
      'boundaries/element-types': [
        'warn',
        {
          default: 'disallow',
          rules: [
            { from: '*', allow: ['shared', 'config', 'database', 'logging'] },
            { from: 'app', allow: ['*'] },
            { from: 'composition', allow: ['*'] },
            { from: 'entrypoint', allow: ['*'] },
            { from: 'tests', allow: ['*'] },
            { from: 'admin', allow: ['admin'] },
            { from: 'auth', allow: ['auth'] },
            { from: 'captures', allow: ['captures'] },
            { from: 'health', allow: ['health'] },
            { from: 'invitations', allow: ['invitations'] },
            { from: 'organizations', allow: ['organizations'] },
            { from: 'processing', allow: ['processing'] },
            { from: 'tasks', allow: ['tasks'] },
            { from: 'users', allow: ['users'] },
          ],
        },
      ],
      'boundaries/no-unknown': 'warn',
    },
  },
];
