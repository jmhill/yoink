import path from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';
import baseConfig from '../../eslint.config.base.js';

// Folder mode rewrites a pattern to `pattern/**/*` and only tests it against the
// path suffix built so far. An exact file (`src/app.ts`) never matches, which is
// why M0.5 left app.ts, composition-root.ts, and the root tests unknown.
// `mode: 'full'` tests the pattern against the whole path on the first pass, and
// the first matching descriptor wins. A full-mode `src/**/*.test.ts` would claim
// `src/access/foo.test.ts` before the access folder descriptor ever saw a long
// enough suffix, so colocated tests stay on the feature element (folder mode)
// and only root tests use a full-mode pattern.

const currentFeatureTypes = [
  'access',
  'captures',
  'config',
  'database',
  'health',
  'history',
  'listing',
  'lists',
  'logging',
  'notes',
  'processing',
  'projects',
  'review',
  'shared',
  'tasks',
  'work',
];

const currentWiringTypes = ['app', 'composition', 'entrypoint', 'tests', 'server'];

const currentTypes = [...currentFeatureTypes, ...currentWiringTypes];

const testTypes = [
  'tests',
  'module-test',
  'workflow-test',
  'edge-test',
  'kernel-test',
  'platform-test',
];

// Public files are their own elements. v5 entry-point has no `from`, so it
// cannot say "layers may import each other, outsiders may not". Layer direction
// is element-types. Entry-point only locks these files to their filename, and
// element-types decides who may import them.
const entryPointTypes = ['module-entry', 'workflow-entry', 'module-testing'];

const layerAndCurrentTypes = [
  'module-domain',
  'module-application',
  'module-infrastructure',
  'module-fakes',
  'module-test',
  'workflow-domain',
  'workflow-application',
  'workflow-policies',
  'workflow-test',
  'edge',
  'edge-shared',
  'edge-test',
  'kernel',
  'kernel-test',
  'platform',
  'platform-database',
  'platform-sql',
  'platform-test',
  ...currentTypes,
];

function sameModule(type) {
  return [type, { module: '${module}' }];
}

function sameWorkflow(type) {
  return [type, { workflow: '${workflow}' }];
}

function sameEdge(type) {
  return [type, { edge: '${edge}' }];
}

const domainPackages = ['neverthrow', 'zod'];

// ADR §10 rule 6. Scoped names are the plugin's baseSource (`@scope/name`).
// `node:fs/promises` is baseSource `node:fs`, which `node:*` matches.
const adapterPackages = [
  ...domainPackages,
  'fastify',
  '@fastify/*',
  '@orpc/*',
  '@libsql/client',
  '@sentry/node',
  '@simplewebauthn/server',
  'node:*',
];

const platformPackages = [...adapterPackages, '@yoink/infrastructure'];

const edgePackages = [...adapterPackages, '@yoink/api-contracts'];

const elements = [
  // Target layout. Full mode, specific patterns before the directories they
  // sit in, so a test is not typed as the layer it lives in.
  {
    type: 'module-test',
    pattern: 'src/modules/([^/]+)/**/*.test.ts',
    mode: 'full',
    capture: ['module'],
  },
  {
    type: 'module-entry',
    pattern: 'src/modules/([^/]+)/index.ts',
    mode: 'full',
    capture: ['module'],
  },
  {
    type: 'module-testing',
    pattern: 'src/modules/([^/]+)/testing.ts',
    mode: 'full',
    capture: ['module'],
  },
  {
    type: 'module-domain',
    pattern: 'src/modules/([^/]+)/domain/**',
    mode: 'full',
    capture: ['module'],
  },
  {
    type: 'module-application',
    pattern: 'src/modules/([^/]+)/application/**',
    mode: 'full',
    capture: ['module'],
  },
  // Fakes are a narrower element than the rest of infrastructure so testing.ts
  // can re-export them (ADR §4.1) without being allowed to reach persistence.
  // Listed before the infrastructure pattern; first match wins.
  {
    type: 'module-fakes',
    pattern: 'src/modules/([^/]+)/infrastructure/fakes/**',
    mode: 'full',
    capture: ['module'],
  },
  {
    type: 'module-infrastructure',
    pattern: 'src/modules/([^/]+)/infrastructure/**',
    mode: 'full',
    capture: ['module'],
  },
  {
    type: 'workflow-test',
    pattern: 'src/workflows/([^/]+)/**/*.test.ts',
    mode: 'full',
    capture: ['workflow'],
  },
  {
    type: 'workflow-entry',
    pattern: 'src/workflows/([^/]+)/index.ts',
    mode: 'full',
    capture: ['workflow'],
  },
  {
    type: 'workflow-domain',
    pattern: 'src/workflows/([^/]+)/domain/**',
    mode: 'full',
    capture: ['workflow'],
  },
  {
    type: 'workflow-application',
    pattern: 'src/workflows/([^/]+)/application/**',
    mode: 'full',
    capture: ['workflow'],
  },
  {
    type: 'workflow-policies',
    pattern: 'src/workflows/([^/]+)/policies/**',
    mode: 'full',
    capture: ['workflow'],
  },
  {
    type: 'edge-test',
    pattern: 'src/edges/([^/]+)/**/*.test.ts',
    mode: 'full',
    capture: ['edge'],
  },
  {
    type: 'edge-shared',
    pattern: 'src/edges/_shared/**',
    mode: 'full',
  },
  {
    type: 'edge',
    pattern: 'src/edges/([^/]+)/**',
    mode: 'full',
    capture: ['edge'],
  },
  {
    type: 'kernel-test',
    pattern: 'src/kernel/**/*.test.ts',
    mode: 'full',
  },
  {
    type: 'kernel',
    pattern: 'src/kernel/**',
    mode: 'full',
  },
  {
    type: 'platform-test',
    pattern: 'src/platform/**/*.test.ts',
    mode: 'full',
  },
  {
    type: 'platform-database',
    pattern: 'src/platform/database/**',
    mode: 'full',
  },
  {
    type: 'platform-sql',
    pattern: 'src/platform/sql/**',
    mode: 'full',
  },
  {
    type: 'platform',
    pattern: 'src/platform/**',
    mode: 'full',
  },
  // Current layout. Folder mode, so each directory (including its tests) is one
  // element. notes, review, and work were missing from the M0.5 registration.
  { type: 'access', pattern: 'src/access/**' },
  { type: 'captures', pattern: 'src/captures/**' },
  { type: 'config', pattern: 'src/config/**' },
  { type: 'database', pattern: 'src/database/**' },
  { type: 'health', pattern: 'src/health/**' },
  { type: 'history', pattern: 'src/history/**' },
  { type: 'listing', pattern: 'src/listing/**' },
  { type: 'lists', pattern: 'src/lists/**' },
  { type: 'logging', pattern: 'src/logging/**' },
  { type: 'notes', pattern: 'src/notes/**' },
  { type: 'processing', pattern: 'src/processing/**' },
  { type: 'projects', pattern: 'src/projects/**' },
  { type: 'review', pattern: 'src/review/**' },
  { type: 'shared', pattern: 'src/shared/**' },
  { type: 'tasks', pattern: 'src/tasks/**' },
  { type: 'work', pattern: 'src/work/**' },
  { type: 'app', pattern: 'src/app.ts', mode: 'full' },
  { type: 'composition', pattern: 'src/composition-root.ts', mode: 'full' },
  { type: 'entrypoint', pattern: 'src/index.ts', mode: 'full' },
  { type: 'entrypoint', pattern: 'src/instrument.ts', mode: 'full' },
  { type: 'entrypoint', pattern: 'src/migrate.ts', mode: 'full' },
  { type: 'entrypoint', pattern: 'src/test-migrations.ts', mode: 'full' },
  { type: 'server', pattern: 'src/json-body.ts', mode: 'full' },
  { type: 'server', pattern: 'src/static-cache-control.ts', mode: 'full' },
  { type: 'server', pattern: 'src/trust-proxy.ts', mode: 'full' },
  { type: 'tests', pattern: 'src/tests/**', mode: 'full' },
  { type: 'tests', pattern: 'src/*.test.ts', mode: 'full' },
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
      // The plugin default is import declarations only. `export type` from
      // `@yoink/api-contracts` and `export { adapter } from './infrastructure'`
      // would not be visited. Export declarations are the same dependency.
      'boundaries/dependency-nodes': ['import', 'export'],
      // Workspace packages resolve to files outside this package, so the plugin
      // would treat them as local and the external rule would never see them.
      // Flagging the import source lets rule 6 apply. Current-layout files still
      // allow every external source, so this does not warn on today's imports.
      'boundaries/flag-as-external': {
        customSourcePatterns: [
          '@yoink/api-contracts',
          '@yoink/api-contracts/**',
          '@yoink/infrastructure',
          '@yoink/infrastructure/**',
        ],
      },
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
            // The previous `from: '*'` would also grant this list to target
            // layers once those files exist. Naming the current types keeps
            // today's allows and leaves target layers on the rules below.
            {
              from: currentTypes,
              allow: ['shared', 'listing', 'config', 'database', 'logging'],
            },
            { from: 'app', allow: ['*'] },
            { from: 'composition', allow: ['*'] },
            { from: 'entrypoint', allow: ['*'] },
            { from: 'tests', allow: ['*'] },
            { from: 'access', allow: ['access'] },
            { from: 'captures', allow: ['captures'] },
            { from: 'health', allow: ['health'] },
            { from: 'history', allow: ['history', 'projects', 'tasks'] },
            { from: 'lists', allow: ['lists'] },
            { from: 'projects', allow: ['projects', 'history'] },
            { from: 'tasks', allow: ['tasks', 'history'] },
            { from: 'processing', allow: ['processing'] },
            { from: 'notes', allow: ['notes'] },
            { from: 'review', allow: ['review'] },
            { from: 'work', allow: ['work'] },
            { from: 'server', allow: ['server'] },
            // Rule 1. Own module only; capture is the module directory name.
            {
              from: 'module-domain',
              allow: [sameModule('module-domain'), 'kernel'],
            },
            {
              from: 'module-application',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                'kernel',
              ],
            },
            {
              from: 'module-infrastructure',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                sameModule('module-infrastructure'),
                sameModule('module-fakes'),
                'kernel',
                'platform',
                'platform-database',
                'platform-sql',
              ],
            },
            {
              from: 'module-fakes',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                sameModule('module-infrastructure'),
                sameModule('module-fakes'),
                'kernel',
                'platform',
                'platform-database',
                'platform-sql',
              ],
            },
            {
              from: 'module-entry',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                'kernel',
              ],
            },
            {
              // ADR §4.1: testing.ts re-exports the same module's
              // infrastructure/fakes. Not persistence, and not another module.
              from: 'module-testing',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                sameModule('module-fakes'),
                'kernel',
              ],
            },
            {
              from: 'module-test',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                sameModule('module-infrastructure'),
                sameModule('module-fakes'),
                sameModule('module-entry'),
                sameModule('module-testing'),
                'kernel',
                'tests',
              ],
            },
            // Rules 2 and 4. Workflows see module index.ts and kernel, never
            // another module's internals, platform, or edges.
            {
              from: 'workflow-domain',
              allow: [sameWorkflow('workflow-domain'), 'kernel', 'module-entry'],
            },
            {
              from: 'workflow-policies',
              allow: [sameWorkflow('workflow-policies'), 'kernel', 'module-entry'],
            },
            {
              from: 'workflow-application',
              allow: [
                sameWorkflow('workflow-domain'),
                sameWorkflow('workflow-policies'),
                sameWorkflow('workflow-application'),
                'kernel',
                'module-entry',
              ],
            },
            {
              from: 'workflow-entry',
              allow: [
                sameWorkflow('workflow-domain'),
                sameWorkflow('workflow-policies'),
                sameWorkflow('workflow-application'),
                'kernel',
                'module-entry',
              ],
            },
            {
              from: 'workflow-test',
              allow: [
                sameWorkflow('workflow-domain'),
                sameWorkflow('workflow-policies'),
                sameWorkflow('workflow-application'),
                sameWorkflow('workflow-entry'),
                'kernel',
                'module-entry',
                'tests',
              ],
            },
            // Rule 5. Platform except database and sql. test-fixtures is the
            // ADR exception that may touch SQL. Full mode makes each edge file
            // its own element, so files in one edge must be allowed by capture.
            // A different captured edge is not this allow.
            {
              from: 'edge',
              allow: [
                sameEdge('edge'),
                'module-entry',
                'workflow-entry',
                'kernel',
                'edge-shared',
                'platform',
              ],
            },
            {
              from: [['edge', { edge: 'test-fixtures' }]],
              allow: ['platform-database', 'platform-sql'],
            },
            {
              from: 'edge-shared',
              allow: [
                'module-entry',
                'workflow-entry',
                'kernel',
                'edge-shared',
                'platform',
              ],
            },
            {
              from: 'edge-test',
              allow: [
                sameEdge('edge'),
                'edge-shared',
                'module-entry',
                'workflow-entry',
                'kernel',
                'platform',
                'tests',
              ],
            },
            {
              from: [['edge-test', { edge: 'test-fixtures' }]],
              allow: ['platform-database', 'platform-sql'],
            },
            { from: 'kernel', allow: ['kernel'] },
            { from: 'kernel-test', allow: ['kernel', 'tests'] },
            {
              from: ['platform', 'platform-database', 'platform-sql'],
              allow: ['kernel', 'platform', 'platform-database', 'platform-sql'],
            },
            {
              from: 'platform-test',
              allow: [
                'kernel',
                'platform',
                'platform-database',
                'platform-sql',
                'tests',
              ],
            },
            // Rule 5 test entry point, after the allows above so it overrides
            // `allow: '*'` on app, composition, and entrypoint. Test types
            // opt back in on the next rule.
            { from: '*', disallow: ['module-testing'] },
            { from: testTypes, allow: ['module-testing'] },
          ],
        },
      ],
      'boundaries/entry-point': [
        'warn',
        {
          default: 'disallow',
          rules: [
            { target: layerAndCurrentTypes, allow: '**' },
            { target: ['module-entry', 'workflow-entry'], allow: 'index.ts' },
            { target: 'module-testing', allow: 'testing.ts' },
          ],
        },
      ],
      'boundaries/external': [
        'warn',
        {
          default: 'disallow',
          rules: [
            {
              from: [
                'module-domain',
                'module-application',
                'module-entry',
                'module-testing',
                'kernel',
                'workflow-domain',
                'workflow-policies',
                'workflow-application',
                'workflow-entry',
              ],
              allow: domainPackages,
            },
            {
              from: ['module-infrastructure', 'module-fakes'],
              allow: adapterPackages,
            },
            {
              from: ['platform', 'platform-database', 'platform-sql'],
              allow: platformPackages,
            },
            { from: ['edge', 'edge-shared'], allow: edgePackages },
            // Colocated tests are not production layers. vitest is the runner.
            // `@yoink/api-contracts` stays off this list, including type-only
            // imports (the plugin's default import nodes include `import type`).
            {
              from: ['module-test', 'workflow-test', 'kernel-test'],
              allow: [...domainPackages, 'vitest', '@vitest/*'],
            },
            {
              from: 'platform-test',
              allow: [...platformPackages, 'vitest', '@vitest/*'],
            },
            {
              from: 'edge-test',
              allow: [...edgePackages, 'vitest', '@vitest/*'],
            },
            // `*` does not match a scoped baseSource. `**` does. Together they
            // keep today's current-layout files with no external check.
            { from: currentTypes, allow: ['*', '**'] },
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
