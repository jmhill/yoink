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
  'edge-auth-test',
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
  'edge-auth',
  'edge-auth-test',
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
  // M5.11-history removed the src/modules/history/** current element.
  // M5.11-captures removed the src/modules/captures/** current element.
  // The folder-mode src/captures/** pattern below stays for boundary fixtures.
  // M5.11-task-management removed the src/modules/task-management/** current
  // element. The old src/tasks, src/projects, src/lists, and src/work patterns
  // stay for boundary fixtures.
  // M5.7 moved notes. Target layer rules disallow @yoink/api-contracts, which
  // this module still imports until M5.11-notes. This descriptor is first, so
  // the current element wins. M5.11-notes removes it. The old src/notes/**
  // pattern stays for boundary fixtures.
  { type: 'notes', pattern: 'src/modules/notes/**', mode: 'full' },
  // M5.10-review moved review. Target layer rules disallow @yoink/api-contracts,
  // which this module still imports until M5.11-review. This descriptor is
  // first, so the current element wins. M5.11-review removes it. The old
  // src/review/** pattern stays for boundary fixtures.
  { type: 'review', pattern: 'src/modules/review/**', mode: 'full' },
  // Target layout. Full mode, specific patterns before the directories they
  // sit in, so a test is not typed as the layer it lives in.
  {
    type: 'module-test',
    pattern: 'src/modules/([^/]+)/**/*.test.ts',
    mode: 'full',
    capture: ['module'],
  },
  // ADR §4.2 names port contract tests `*.contract.ts`. They are tests, so
  // they are module-test rather than module-infrastructure.
  {
    type: 'module-test',
    pattern: 'src/modules/([^/]+)/**/*.contract.ts',
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
    // M3.6. Before the general edge-test pattern. Only the auth middleware
    // tests. They keep calling access fakes until M5.13. Other files under
    // edges/_shared stay edge-test and still cannot import access.
    type: 'edge-auth-test',
    pattern: 'src/edges/_shared/auth/**/*.test.ts',
    mode: 'full',
  },
  {
    type: 'edge-test',
    pattern: 'src/edges/([^/]+)/**/*.test.ts',
    mode: 'full',
    capture: ['edge'],
  },
  {
    // M3.5. Before edge-shared, so auth middleware is not the whole shared folder.
    // These files still call access services. M5.13 replaces that with an interface.
    type: 'edge-auth',
    pattern: 'src/edges/_shared/auth/**',
    mode: 'full',
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
            // `kernel` is ADR §3.4: any current layer may import kernel.
            // Kernel itself stays on the kernel-only rule further down.
            // M2.2 moved config, database, logging, and the SQL helpers into
            // platform. M2.4 moved the shared HTTP helpers into edges/_shared.
            // These are the same imports under the new paths.
            // Target layers are not in currentTypes, so they do not gain this.
            // Folder mode cannot split domain from infrastructure, so the
            // domain ban on edges/_shared is the error rule below.
            {
              from: currentTypes,
              allow: [
                'shared',
                'listing',
                'config',
                'database',
                'logging',
                'kernel',
                'platform',
                'platform-database',
                'platform-sql',
                'edge-shared',
              ],
            },
            { from: 'app', allow: ['*'] },
            { from: 'composition', allow: ['*'] },
            { from: 'entrypoint', allow: ['*'] },
            { from: 'tests', allow: ['*'] },
            // M3.3. Colocated route tests still live in access until M3.6.
            // They may import the legacy edge they exercise. Other edges stay
            // disallowed, including public-api.
            // M3.6 moved the access HTTP tests onto the legacy edge and the
            // auth middleware tests. Access no longer imports an edge.
            { from: 'access', allow: ['access'] },
            { from: 'captures', allow: ['captures'] },
            // M3.6 moved the health HTTP tests onto the ops edge.
            { from: 'health', allow: ['health'] },
            // M5.11-history. Application and tests still import task-management
            // domain errors. The current element used to cover that.
            {
              from: [
                ['module-application', { module: 'history' }],
                ['module-test', { module: 'history' }],
              ],
              allow: [['module-domain', { module: 'task-management' }]],
            },
            // M4.2: lists, notes, and processing still import the change log.
            { from: 'lists', allow: ['lists', 'history'] },
            { from: 'projects', allow: ['projects', 'history'] },
            { from: 'tasks', allow: ['tasks', 'history'] },
            { from: 'processing', allow: ['processing', 'history'] },
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
            // M5.11-task-management. Change-log records still live in history,
            // and this module writes them. M5.11-history removed the history
            // element, so the allow names the layers those imports are now.
            // Stored notebook pages are JSON parsed with the shared helper.
            {
              from: [
                ['module-domain', { module: 'task-management' }],
                ['module-application', { module: 'task-management' }],
                ['module-infrastructure', { module: 'task-management' }],
                ['module-test', { module: 'task-management' }],
              ],
              allow: [
                ['module-domain', { module: 'history' }],
                ['module-application', { module: 'history' }],
                ['module-infrastructure', { module: 'history' }],
                ['module-testing', { module: 'history' }],
              ],
            },
            // M5.11-history. testing.ts re-exports the in-memory change log and
            // the fake participant. They are not under infrastructure/fakes/.
            {
              from: [['module-testing', { module: 'history' }]],
              allow: [['module-infrastructure', { module: 'history' }]],
            },
            {
              from: [['module-infrastructure', { module: 'task-management' }]],
              allow: ['edge-shared'],
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
              // M5.11-captures. Colocated module tests already build the
              // in-memory unit of work and open the test database. Those
              // files are platform and platform-database. A store test imports
              // the port contract file, which is also module-test.
              from: 'module-test',
              allow: [
                sameModule('module-domain'),
                sameModule('module-application'),
                sameModule('module-infrastructure'),
                sameModule('module-fakes'),
                sameModule('module-entry'),
                sameModule('module-testing'),
                sameModule('module-test'),
                'kernel',
                'platform',
                'platform-database',
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
                'edge-auth',
                'edge-shared',
                'platform',
              ],
            },
            // M3.4. Only the test-fixtures edge. These routes still call
            // today's access stores and the admin session middleware. M7.4
            // retires them. Other modules stay disallowed.
            {
              from: [['edge', { edge: 'test-fixtures' }]],
              allow: ['platform-database', 'platform-sql', 'access'],
            },
            // M3.4. The health HTTP error map stays in health/application.
            // Only the ops edge imports it.
            {
              from: [['edge', { edge: 'ops' }]],
              allow: ['health'],
            },
            // M3.2. Only the public-api edge, not every edge. These are the
            // module handlers this edge still calls:
            // M5.1 captures, M5.2 task-management, M5.7 notes,
            // M5.10 review. M5.11-history history is module-entry, which the
            // general edge rule already allows.
            // Processing is a workflow, reached through workflow-entry on the
            // general edge rule. Access is not allowed.
            // Task, project, list, and work routes call the task-management
            // index, which is module-entry.
            {
              from: [['edge', { edge: 'public-api' }]],
              allow: ['captures', 'notes', 'review'],
            },
            // M6.1. The extension edge calls the captures interface only.
            {
              from: [['edge', { edge: 'extension' }]],
              allow: ['captures'],
            },
            // M6.2 Inbox calls the captures interface.
            // M6.3-settings and M6.3-auth call today's access handlers through narrow ports.
            // M6.3-tasks-lists calls the task-management list and task handlers.
            // M6.3-project-page calls the task-management project handlers.
            // M6.3-work calls the Now, due, and work-list queries, then access member reads.
            // It arranges those pages into sections and does not re-sort them.
            // Open-task pages stay in query order. Project history and finished
            // tasks call the history entry. Notes stay on the alias.
            // M5.13 replaces the access handlers. This edge does not import access SQL.
            {
              from: [['edge', { edge: 'web' }]],
              allow: ['captures', 'access'],
            },
            // M3.3. Only the legacy client edge. These routes still call today's
            // access handlers. M6 moves each client to its own edge. M5.12 and
            // M5.13 give access an interface. Other modules stay disallowed.
            {
              from: [['edge', { edge: 'legacy' }]],
              allow: ['access'],
            },
            // M6.4. The admin edge calls the same access handlers the legacy
            // admin routes call. Other modules stay disallowed.
            {
              from: [['edge', { edge: 'admin' }]],
              allow: ['access'],
            },
            // M3.5. Auth adapters may call today's access services until M5.13.
            // The rest of edges/_shared may not.
            {
              from: 'edge-auth',
              allow: ['edge-auth', 'access', 'kernel', 'edge-shared'],
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
            // M3.6. Auth middleware tests only. Production files under
            // edges/_shared/auth stay edge-auth and are not this type.
            {
              from: 'edge-auth-test',
              allow: ['edge-auth', 'access', 'kernel', 'edge-shared', 'tests'],
            },
            {
              from: 'edge-test',
              allow: [
                sameEdge('edge'),
                'edge-auth',
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
            // M3.6. Legacy HTTP tests use the access fakes and boot helpers
            // they already used. Production legacy still cannot import
            // composition, or platform-database. Task-management fakes are
            // module-testing, which every test type may import.
            {
              from: [['edge-test', { edge: 'legacy' }]],
              allow: [
                'access',
                'platform-database',
                'composition',
                ['edge', { edge: 'admin' }],
              ],
            },
            // M3.6. The health error-map test imports the map that stays in
            // health. Production ops already may import health.
            {
              from: [['edge-test', { edge: 'ops' }]],
              allow: ['health'],
            },
            // M3.6. The modules this edge already calls, plus the test
            // database. Production public-api still does not allow processing,
            // access, or platform-database.
            {
              from: [['edge-test', { edge: 'public-api' }]],
              allow: [
                'captures',
                'notes',
                'review',
                ['module-infrastructure', { module: 'history' }],
                'platform-database',
              ],
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
            { from: ['edge', 'edge-auth', 'edge-shared'], allow: edgePackages },
            // Colocated tests are not production layers. vitest is the runner.
            // `@yoink/api-contracts` stays off this list, including type-only
            // imports (the plugin's default import nodes include `import type`).
            // Module tests use the fake clock and id generator. The package
            // stays off domain, application, and infrastructure.
            {
              from: 'module-test',
              allow: [...domainPackages, 'vitest', '@vitest/*', '@yoink/infrastructure'],
            },
            // M5.11-task-management. The unit-of-work test opens a temp database
            // file. The current element allowed node:*. This test still does.
            {
              from: [['module-test', { module: 'task-management' }]],
              allow: ['node:*'],
            },
            // M5.11-history. The event-sink test opens a temp libsql file.
            // The current element allowed node:* and @libsql/client.
            {
              from: [['module-test', { module: 'history' }]],
              allow: ['node:*', '@libsql/client'],
            },
            {
              from: ['workflow-test', 'kernel-test'],
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
            // M3.6. Test fakes only. Production edge-auth and legacy stay off
            // @yoink/infrastructure.
            {
              from: 'edge-auth-test',
              allow: [...edgePackages, 'vitest', '@vitest/*', '@yoink/infrastructure'],
            },
            {
              from: [['edge-test', { edge: 'legacy' }]],
              allow: [...edgePackages, 'vitest', '@vitest/*', '@yoink/infrastructure'],
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
    // Tests may import fakes. Clock, IdGenerator, and PasswordHasher types
    // live in kernel. The package still holds the runtime implementations.
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
            {
              group: ['@yoink/infrastructure', '@yoink/infrastructure/*'],
              message:
                'domain and application import Clock, IdGenerator, and PasswordHasher from kernel. Runtime values stay in @yoink/infrastructure for platform, the composition root, and tests.',
            },
          ],
        },
      ],
    },
  },
  {
    // Application HTTP routes import edges/_shared. Domain does not.
    // This block replaces the rule above for domain files, so it repeats it.
    files: ['src/**/domain/**/*.ts'],
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
            {
              group: ['@yoink/infrastructure', '@yoink/infrastructure/*'],
              message:
                'domain and application import Clock, IdGenerator, and PasswordHasher from kernel. Runtime values stay in @yoink/infrastructure for platform, the composition root, and tests.',
            },
            {
              group: ['**/edges/_shared', '**/edges/_shared/**'],
              message:
                'domain does not import edge HTTP helpers',
            },
          ],
        },
      ],
    },
  },
  {
    // M3.5. Access contains no Fastify or oRPC imports. HTTP tests stay in
    // access until M3.6 and are ignored. This block replaces the rule for
    // access files, so it repeats the infrastructure and domain bans.
    files: ['src/access/**/{domain,application}/**/*.ts'],
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
            {
              group: ['@yoink/infrastructure', '@yoink/infrastructure/*'],
              message:
                'domain and application import Clock, IdGenerator, and PasswordHasher from kernel. Runtime values stay in @yoink/infrastructure for platform, the composition root, and tests.',
            },
            {
              group: ['**/edges/_shared', '**/edges/_shared/**'],
              message:
                'domain does not import edge HTTP helpers',
            },
            {
              group: [
                'fastify',
                'fastify/**',
                '@fastify/*',
                '@fastify/*/**',
                '@orpc/*',
                '@orpc/*/**',
              ],
              message:
                'access contains no Fastify or oRPC imports. HTTP adapters live on an edge.',
            },
          ],
        },
      ],
    },
  },
  {
    // M3.5. The same Fastify and oRPC ban for access infrastructure. This
    // folder may import @yoink/infrastructure. HTTP adapters do not live here.
    files: ['src/access/infrastructure/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'fastify',
                'fastify/**',
                '@fastify/*',
                '@fastify/*/**',
                '@orpc/*',
                '@orpc/*/**',
              ],
              message:
                'access contains no Fastify or oRPC imports. HTTP adapters live on an edge.',
            },
          ],
        },
      ],
    },
  },
];
