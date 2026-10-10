import path from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';
import baseConfig from '../../eslint.config.base.js';

const elements = [
  { type: 'access', pattern: 'src/access/**' },
  { type: 'captures', pattern: 'src/captures/**' },
  { type: 'config', pattern: 'src/config/**' },
  { type: 'database', pattern: 'src/database/**' },
  { type: 'health', pattern: 'src/health/**' },
  { type: 'listing', pattern: 'src/listing/**' },
  { type: 'lists', pattern: 'src/lists/**' },
  { type: 'logging', pattern: 'src/logging/**' },
  { type: 'processing', pattern: 'src/processing/**' },
  { type: 'projects', pattern: 'src/projects/**' },
  { type: 'shared', pattern: 'src/shared/**' },
  { type: 'tasks', pattern: 'src/tasks/**' },
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
      // Resolve ESM `.js` import specifiers back to their `.ts` sources so the
      // boundaries plugin can match imported files against element patterns
      'import/resolver': {
        typescript: { project: path.join(rootPath, 'tsconfig.json') },
      },
    },
    rules: {
      'boundaries/element-types': [
        'warn',
        {
          default: 'disallow',
          rules: [
            { from: '*', allow: ['shared', 'listing', 'config', 'database', 'logging'] },
            { from: 'app', allow: ['*'] },
            { from: 'composition', allow: ['*'] },
            { from: 'entrypoint', allow: ['*'] },
            { from: 'tests', allow: ['*'] },
            { from: 'access', allow: ['access'] },
            { from: 'captures', allow: ['captures'] },
            { from: 'health', allow: ['health'] },
            { from: 'lists', allow: ['lists'] },
            { from: 'processing', allow: ['processing'] },
            { from: 'projects', allow: ['projects', 'access'] },
            { from: 'tasks', allow: ['tasks'] },
          ],
        },
      ],
      'boundaries/no-unknown': 'warn',
    },
  },
  {
    // Hexagonal: domain and application must not import adapters.
    // Tests may import fakes. `@yoink/infrastructure` (Clock, etc.) is a
    // shared kernel, not a feature adapter, so it is not in this pattern.
    files: ['src/**/{domain,application}/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/infrastructure/*'],
              message:
                'domain and application must not import hexagonal infrastructure adapters',
            },
          ],
        },
      ],
    },
  },
];
