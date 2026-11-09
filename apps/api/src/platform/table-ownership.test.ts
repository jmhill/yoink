import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { legacyMigrationCutoffIs43, type Migration } from './database/types.js';
import { migrations } from './database/migrations/index.js';
import { TABLE_OWNERSHIP_ALLOWLIST } from './table-ownership.allowlist.js';
import {
  FIXTURE_ROUTE_PATHS,
  LEGACY_MIGRATION_VERSION,
  PLANNED_TABLES,
  TABLE_OWNERS,
  checkMigrationOwnership,
  checkTableOwnership,
  classifyApiPath,
  collectOwnershipFailures,
  isWorkflowInfrastructurePath,
  moduleOwnersMatchMigrationOwners,
  readMigrationFields,
  stringLiteralsInTypescript,
  tableReferencesInLiteral,
  type ScannedSourceFile,
  type TableName,
  type TableOwnershipAllowlistEntry,
} from './table-ownership.js';

const apiSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

const posixRelative = (root: string, full: string): string =>
  relative(root, full).split(sep).join('/');

const scanSourceFiles = (root: string): ScannedSourceFile[] => {
  const files: ScannedSourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
        continue;
      }
      files.push({
        path: posixRelative(root, full),
        literals: stringLiteralsInTypescript(readFileSync(full, 'utf8')),
      });
    }
  };
  walk(root);
  return files;
};

const listDirectories = (root: string): string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const full = join(dir, entry.name);
      found.push(posixRelative(root, full));
      walk(full);
    }
  };
  walk(root);
  return found;
};

const scanned = (path: string, source: string): ScannedSourceFile => ({
  path,
  literals: stringLiteralsInTypescript(source),
});

const allow = (
  entry: TableOwnershipAllowlistEntry
): TableOwnershipAllowlistEntry => entry;

describe('table reference heuristic', () => {
  it('matches the keyword forms this code actually writes, including joins and quotes', () => {
    expect(tableReferencesInLiteral('SELECT 1 FROM captures WHERE id = ?')).toEqual([
      { keyword: 'FROM', table: 'captures', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('DELETE FROM tasks WHERE id = ?')).toEqual([
      { keyword: 'FROM', table: 'tasks', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('INSERT OR IGNORE INTO captures VALUES (?)')).toEqual([
      { keyword: 'INTO', table: 'captures', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('UPDATE\n  captures SET deleted_at = ?')).toEqual([
      { keyword: 'UPDATE', table: 'captures', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('LEFT OUTER JOIN "tasks" t ON t.id = p.id')).toEqual([
      { keyword: 'JOIN', table: 'tasks', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('INNER JOIN [projects] AS p')).toEqual([
      { keyword: 'JOIN', table: 'projects', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('JOIN `users` u ON u.id = m.user_id')).toEqual([
      { keyword: 'JOIN', table: 'users', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('from "TASKS"')).toEqual([
      { keyword: 'FROM', table: 'tasks', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER)')).toEqual([
      { keyword: 'TABLE', table: '_migrations', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('ALTER TABLE tasks ADD COLUMN project_id TEXT')).toEqual([
      { keyword: 'TABLE', table: 'tasks', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('DROP TABLE change_log')).toEqual([
      { keyword: 'TABLE', table: 'change_log', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('FROM main.tasks')).toEqual([
      { keyword: 'FROM', table: 'tasks', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('FROM projects.id')).toEqual([
      { keyword: 'FROM', table: 'projects', identityAnchor: false },
    ]);
    expect(
      tableReferencesInLiteral(`
        tasks t
        JOIN projects p
      `)
    ).toEqual([
      { keyword: 'FROM', table: 'tasks', identityAnchor: false },
      { keyword: 'JOIN', table: 'projects', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('project_notes AS n\n')).toEqual([
      { keyword: 'FROM', table: 'project_notes', identityAnchor: false },
    ]);
  });

  it('treats REFERENCES organizations(id) and users(id) as identity anchors', () => {
    expect(tableReferencesInLiteral('REFERENCES organizations(id)')).toEqual([
      { keyword: 'REFERENCES', table: 'organizations', identityAnchor: true },
    ]);
    expect(tableReferencesInLiteral('REFERENCES users ( id ) ON DELETE CASCADE')).toEqual([
      { keyword: 'REFERENCES', table: 'users', identityAnchor: true },
    ]);
    expect(tableReferencesInLiteral('REFERENCES "organizations"("id")')).toEqual([
      { keyword: 'REFERENCES', table: 'organizations', identityAnchor: true },
    ]);
    expect(tableReferencesInLiteral('REFERENCES organizations(name)')).toEqual([
      { keyword: 'REFERENCES', table: 'organizations', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('REFERENCES captures(id)')).toEqual([
      { keyword: 'REFERENCES', table: 'captures', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('FROM users WHERE id = ?')).toEqual([
      { keyword: 'FROM', table: 'users', identityAnchor: false },
    ]);
  });

  it('does not treat opaque ids, comments, prose, or interpolated names as table references', () => {
    expect(tableReferencesInLiteral('WHERE capture_id = ? AND project_id = ?')).toEqual([]);
    expect(tableReferencesInLiteral('tasks')).toEqual([]);
    expect(
      tableReferencesInLiteral(
        'CaptureStore requires "captures" table. Ensure migrations have been run.'
      )
    ).toEqual([]);
    expect(tableReferencesInLiteral('SELECT name FROM sqlite_master WHERE name = \'captures\'')).toEqual(
      []
    );
    expect(stringLiteralsInTypescript('const q = `FROM ${name}`;')).toEqual(['FROM ', '']);
    expect(tableReferencesInLiteral('FROM ')).toEqual([]);
    expect(tableReferencesInLiteral('FROM projects, tasks')).toEqual([
      { keyword: 'FROM', table: 'projects', identityAnchor: false },
    ]);
    expect(tableReferencesInLiteral('BEFORE UPDATE ON captures')).toEqual([]);
    expect(
      stringLiteralsInTypescript(`
        /**
         * \`UPDATE captures SET deleted_at = ?\`
         */
        const value = 1;
      `)
    ).toEqual([]);
    expect(
      stringLiteralsInTypescript(`
        // UPDATE captures SET deleted_at = ?
        export const sql = 'SELECT 1 FROM tasks';
      `)
    ).toEqual(['SELECT 1 FROM tasks']);
  });

  it('keeps template parts apart so an interpolated table name is not glued back together', () => {
    const literals = stringLiteralsInTypescript('const sql = `SELECT ${cols} FROM ${table}`;');
    expect(literals.flatMap(tableReferencesInLiteral)).toEqual([]);
    const nested = stringLiteralsInTypescript(
      'const sql = `a ${`INNER JOIN tasks t`} FROM projects`;'
    );
    expect(nested.flatMap(tableReferencesInLiteral)).toEqual([
      { keyword: 'JOIN', table: 'tasks', identityAnchor: false },
      { keyword: 'FROM', table: 'projects', identityAnchor: false },
    ]);
  });
});

describe('path ownership', () => {
  it('keeps history under modules/history and leaves no shared directory', () => {
    expect(existsSync(join(apiSrc, 'shared'))).toBe(false);
    expect(existsSync(join(apiSrc, 'history'))).toBe(false);
    expect(readdirSync(join(apiSrc, 'modules', 'history')).sort()).toEqual([
      'application',
      'domain',
      'index.ts',
      'infrastructure',
      'testing.ts',
    ]);
  });

  it('maps target paths and today\'s layout, and keeps SQL in infrastructure', () => {
    expect(classifyApiPath('modules/task-management/infrastructure/tasks.ts')).toEqual({
      kind: 'module-infrastructure',
      owner: 'task-management',
    });
    expect(classifyApiPath('modules/task-management/domain/task.ts')).toEqual({
      kind: 'module-other',
      owner: 'task-management',
    });
    expect(classifyApiPath('tasks/infrastructure/task-row-statements.ts')).toEqual({
      kind: 'module-infrastructure',
      owner: 'task-management',
    });
    expect(classifyApiPath('projects/infrastructure/store-backed-persist.ts')).toEqual({
      kind: 'module-infrastructure',
      owner: 'task-management',
    });
    expect(classifyApiPath('lists/domain/list.ts')).toEqual({
      kind: 'module-other',
      owner: 'task-management',
    });
    expect(classifyApiPath('modules/history/infrastructure/sql.ts')).toEqual({
      kind: 'module-infrastructure',
      owner: 'history',
    });
    expect(classifyApiPath('review/domain/build-review.ts')).toEqual({
      kind: 'module-other',
      owner: 'review',
    });
    expect(classifyApiPath('platform/database/migrator.ts')).toEqual({ kind: 'platform' });
    expect(classifyApiPath('platform/table-ownership.ts')).toEqual({ kind: 'platform' });
    expect(classifyApiPath('kernel/listing/cursor.ts')).toEqual({ kind: 'no-sql', area: 'kernel' });
    expect(classifyApiPath('workflows/processing/domain/pipeline.ts')).toEqual({
      kind: 'no-sql',
      area: 'workflow',
    });
    expect(classifyApiPath('processing/infrastructure/process-row-statements.ts')).toEqual({
      kind: 'no-sql',
      area: 'processing',
    });
    expect(classifyApiPath('work/infrastructure/sqlite-work-store.ts')).toEqual({
      kind: 'no-sql',
      area: 'work',
    });
    expect(classifyApiPath('edges/web/inbox.ts')).toEqual({ kind: 'no-sql', area: 'edge' });
    expect(classifyApiPath('edges/test-fixtures/review.ts')).toEqual({
      kind: 'exempt',
      reason: 'test-fixtures',
    });
    expect(classifyApiPath('platform/sql/page-sqlite.ts')).toEqual({ kind: 'platform' });
    expect(classifyApiPath('edges/_shared/http-listed-page.ts')).toEqual({
      kind: 'no-sql',
      area: 'edge',
    });
    expect(classifyApiPath('edges/_shared/server/json-body.ts')).toEqual({
      kind: 'no-sql',
      area: 'edge',
    });
    expect(classifyApiPath(`platform/database/migrations/0${LEGACY_MIGRATION_VERSION}-owner-invites.ts`)).toEqual({
      kind: 'exempt',
      reason: 'legacy-migration',
    });
    const laterMigration = `platform/database/migrations/${String(LEGACY_MIGRATION_VERSION + 1).padStart(3, '0')}-next.ts`;
    expect(classifyApiPath(laterMigration)).toEqual({
      kind: 'exempt',
      reason: 'later-migration',
    });
    expect(classifyApiPath('tasks/infrastructure/task-row-statements.test.ts')).toEqual({
      kind: 'exempt',
      reason: 'test-file',
    });
    expect(classifyApiPath('tests/helpers/migration-seed.ts')).toEqual({
      kind: 'exempt',
      reason: 'test-support',
    });
    expect(classifyApiPath('tests/helpers/nested/seed.ts')).toEqual({
      kind: 'exempt',
      reason: 'test-support',
    });
    for (const path of FIXTURE_ROUTE_PATHS) {
      expect(classifyApiPath(path)).toEqual({ kind: 'exempt', reason: 'test-fixtures' });
    }
  });

  it('gives review no table and keeps notes_settings planned', () => {
    expect(Object.values(TABLE_OWNERS)).not.toContain('review');
    expect(TABLE_OWNERS.notes_settings).toBe('notes');
    expect(PLANNED_TABLES).toEqual(['notes_settings']);
    expect(TABLE_OWNERS.organizations).toBe('access');
    expect(TABLE_OWNERS.users).toBe('access');
    expect(TABLE_OWNERS._migrations).toBe('platform');
  });
});

const HELPER_SQL = 'export const q = "INSERT INTO user_sessions (id) VALUES (?)";';

const REAL_TEST_CALL = /(?:^|[^\w$.])(?:it|test)(?:\.[A-Za-z_$][\w$]*)*\s*\(/;

const codeWithoutCommentsAndStrings = (source: string): string => {
  const code: string[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end + 1;
      code.push('\n');
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      code.push(' ');
      continue;
    }
    const quote = source[index];
    if (quote === "'" || quote === '"' || quote === '`') {
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      code.push(' ');
      continue;
    }
    code.push(quote ?? '');
    index += 1;
  }
  return code.join('');
};

const sourceHasRealTest = (source: string): boolean =>
  REAL_TEST_CALL.test(codeWithoutCommentsAndStrings(source));

const resolveRelativeTs = (fromFile: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const base = join(dirname(fromFile), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`];
  for (const candidate of candidates) {
    if (candidate.endsWith('.ts') && existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

/** A suite is an `it`/`test` call, or a called relative import that contains one. */
const fileRegistersTests = (file: string): boolean => {
  const source = readFileSync(file, 'utf8');
  if (sourceHasRealTest(source)) {
    return true;
  }
  const calls = new Set<string>();
  for (const match of codeWithoutCommentsAndStrings(source).matchAll(
    /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g
  )) {
    const name = match[1];
    if (name !== undefined) {
      calls.add(name);
    }
  }
  const imported =
    /import\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"](\.[^'"]+)['"]/g;
  for (const match of source.matchAll(imported)) {
    const body = match[1];
    const specifier = match[2];
    if (body === undefined || specifier === undefined) {
      continue;
    }
    const target = resolveRelativeTs(file, specifier);
    if (target === undefined || !sourceHasRealTest(readFileSync(target, 'utf8'))) {
      continue;
    }
    for (const part of body.split(',')) {
      const cleaned = part.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const alias = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(
        cleaned
      );
      const local = alias?.[2] ?? alias?.[1];
      if (local !== undefined && calls.has(local)) {
        return true;
      }
    }
  }
  return false;
};

const listTestSources = (root: string): string[] => {
  const found: string[] = [];
  const skip = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) {
          walk(join(dir, entry.name));
        }
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        found.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return found;
};

describe('test-support exemption', () => {
  it('applies only under tests/helpers and leaves every other path enforced', () => {
    const outside = [
      'tests/test-app.ts',
      'tests/helpers.ts',
      'tests/helpers-extra/seed.ts',
      'captures/tests/helpers/seed.ts',
      'platform/tests/helpers/seed.ts',
      'modules/history/tests/helpers/seed.ts',
      'platform/database/migrator.ts',
    ];
    for (const path of outside) {
      const role = classifyApiPath(path);
      if (role.kind === 'exempt') {
        expect(role.reason).not.toBe('test-support');
      }
    }
    expect(classifyApiPath('tests/test-app.ts')).toEqual({ kind: 'no-sql', area: 'tests' });
    expect(classifyApiPath('tests/helpers.ts')).toEqual({ kind: 'no-sql', area: 'tests' });
    expect(classifyApiPath('platform/database/migrator.ts')).toEqual({ kind: 'platform' });

    const helper = checkTableOwnership([scanned('tests/helpers/seed.ts', HELPER_SQL)], []);
    expect(helper.violations).toEqual([]);
    const testsRoot = checkTableOwnership([scanned('tests/seed.ts', HELPER_SQL)], []);
    expect(testsRoot.violations).toEqual([
      { path: 'tests/seed.ts', keyword: 'INTO', table: 'user_sessions', count: 1 },
    ]);
    const production = checkTableOwnership(
      [scanned('captures/infrastructure/seed.ts', HELPER_SQL)],
      []
    );
    expect(production.violations).toEqual([
      {
        path: 'captures/infrastructure/seed.ts',
        keyword: 'INTO',
        table: 'user_sessions',
        count: 1,
      },
    ]);
  });

  it('fails when a *.test.ts file has no real test', () => {
    expect(sourceHasRealTest('export const seed = () => {};')).toBe(false);
    expect(sourceHasRealTest('describe("empty", () => { /* no test */ });')).toBe(false);
    expect(sourceHasRealTest('// it("commented")\nexport const x = 1;')).toBe(false);
    expect(sourceHasRealTest('const label = "it(\\"not a call\\")";')).toBe(false);
    expect(sourceHasRealTest('it.each([1])("n", () => {});')).toBe(true);
    expect(sourceHasRealTest('test.skip("held", () => {});')).toBe(true);

    const scratch = mkdtempSync(join(tmpdir(), 'yoink-suite-'));
    try {
      writeFileSync(join(scratch, 'empty.test.ts'), 'export const seed = () => {};\n');
      writeFileSync(
        join(scratch, 'contract.ts'),
        'export const run = () => { it("n", () => {}); };\n'
      );
      writeFileSync(
        join(scratch, 'uses.test.ts'),
        'import { run } from "./contract.js";\ndescribe("s", () => { run(); });\n'
      );
      writeFileSync(
        join(scratch, 'idle.test.ts'),
        'import { run } from "./contract.js";\nexport const unused = run;\n'
      );
      expect(fileRegistersTests(join(scratch, 'empty.test.ts'))).toBe(false);
      expect(fileRegistersTests(join(scratch, 'uses.test.ts'))).toBe(true);
      expect(fileRegistersTests(join(scratch, 'idle.test.ts'))).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }

    const apiRoot = dirname(apiSrc);
    const missing = listTestSources(apiRoot)
      .filter((file) => !fileRegistersTests(file))
      .map((file) => posixRelative(apiRoot, file))
      .sort();
    expect(missing).toEqual([]);
    expect(existsSync(join(apiSrc, 'tests/helpers/migration-seed.ts'))).toBe(true);
    expect(existsSync(join(apiSrc, 'tests/helpers/seed-test-user-session.ts'))).toBe(true);
    expect(existsSync(join(apiSrc, 'tests/helpers/migration-seed.test.ts'))).toBe(false);
    expect(existsSync(join(apiSrc, 'tests/helpers/seed-test-user-session.test.ts'))).toBe(false);
    const vitestConfig = readFileSync(join(apiRoot, 'vitest.config.ts'), 'utf8');
    expect(vitestConfig).not.toContain('migration-seed.test.ts');
    expect(vitestConfig).not.toContain('seed-test-user-session.test.ts');
  });
});

describe('planted ownership failures', () => {
  it('fails a planted cross-owner statement that is not allowlisted', () => {
    const files = [
      scanned(
        'tasks/infrastructure/planted.ts',
        'export const sql = "UPDATE captures SET deleted_at = ?";'
      ),
    ];
    const report = checkTableOwnership(files, []);
    expect(report.violations).toEqual([
      {
        path: 'tasks/infrastructure/planted.ts',
        keyword: 'UPDATE',
        table: 'captures',
        count: 1,
      },
    ]);
    expect(report.staleAllowlist).toEqual([]);
  });

  it('does not let an allowlisted file hide a different table or a higher count', () => {
    const covered = allow({
      path: 'tasks/infrastructure/planted.ts',
      keyword: 'UPDATE',
      table: 'captures',
      count: 1,
      removedBy: 'M5.5',
    });
    const files = [
      scanned(
        'tasks/infrastructure/planted.ts',
        `
          export const a = 'UPDATE captures SET deleted_at = ?';
          export const b = 'UPDATE captures SET deleted_at = ?';
          export const c = 'FROM change_log';
        `
      ),
    ];
    const report = checkTableOwnership(files, [covered]);
    expect(report.violations).toEqual([
      {
        path: 'tasks/infrastructure/planted.ts',
        keyword: 'FROM',
        table: 'change_log',
        count: 1,
      },
      {
        path: 'tasks/infrastructure/planted.ts',
        keyword: 'UPDATE',
        table: 'captures',
        count: 2,
      },
    ]);
    expect(report.staleAllowlist).toEqual([covered]);
  });

  it('fails a stale allowlist entry that no longer matches a hit', () => {
    const stale = allow({
      path: 'tasks/infrastructure/gone.ts',
      keyword: 'UPDATE',
      table: 'captures',
      count: 1,
      removedBy: 'M5.5',
    });
    const report = checkTableOwnership([], [stale]);
    expect(report.violations).toEqual([]);
    expect(report.staleAllowlist).toEqual([stale]);
  });

  it('allows an owner\'s infrastructure, identity anchors, legacy migrations, and test fixtures', () => {
    const files = [
      scanned('tasks/infrastructure/own.ts', 'export const sql = "FROM tasks";'),
      scanned(
        'tasks/infrastructure/same-owner.ts',
        'export const sql = "DELETE FROM projects";'
      ),
      scanned(
        'tasks/domain/not-infrastructure.ts',
        'export const sql = "FROM tasks";'
      ),
      scanned(
        'tasks/infrastructure/anchor.ts',
        'export const sql = "REFERENCES organizations(id), REFERENCES users(id)";'
      ),
      scanned(
        'tasks/infrastructure/foreign-key.ts',
        'export const sql = "REFERENCES captures(id)";'
      ),
      scanned(
        'platform/database/migrations/043-legacy.ts',
        'export const sql = "REFERENCES captures(id)";'
      ),
      // Later migration files are not platform code. checkMigrationOwnership owns them.
      scanned(
        'platform/database/migrations/044-new.ts',
        'export const sql = "CREATE TABLE tasks (id TEXT)";'
      ),
      scanned('edges/test-fixtures/review.ts', 'export const sql = "UPDATE tasks SET completed_at = ?";'),
      scanned('edges/web/inbox.ts', 'export const sql = "FROM captures";'),
      scanned('workflows/processing/domain/run.ts', 'export const sql = "FROM captures";'),
      scanned('tasks/infrastructure/own.test.ts', 'export const sql = "UPDATE captures SET x = 1";'),
    ];
    const report = checkTableOwnership(files, []);
    expect(report.violations).toEqual([
      {
        path: 'edges/web/inbox.ts',
        keyword: 'FROM',
        table: 'captures',
        count: 1,
      },
      {
        path: 'tasks/domain/not-infrastructure.ts',
        keyword: 'FROM',
        table: 'tasks',
        count: 1,
      },
      {
        path: 'tasks/infrastructure/foreign-key.ts',
        keyword: 'REFERENCES',
        table: 'captures',
        count: 1,
      },
      {
        path: 'workflows/processing/domain/run.ts',
        keyword: 'FROM',
        table: 'captures',
        count: 1,
      },
    ]);
  });

  it('fails a planted workflows/*/infrastructure directory and ignores today\'s processing/infrastructure', () => {
    expect(isWorkflowInfrastructurePath('workflows/processing/infrastructure')).toBe(true);
    expect(isWorkflowInfrastructurePath('workflows/processing/infrastructure/sql')).toBe(false);
    expect(isWorkflowInfrastructurePath('processing/infrastructure')).toBe(false);
    expect(isWorkflowInfrastructurePath('workflows/processing/policies')).toBe(false);

    const root = mkdtempSync(join(tmpdir(), 'yoink-table-ownership-'));
    try {
      mkdirSync(join(root, 'workflows', 'demo', 'infrastructure'), { recursive: true });
      mkdirSync(join(root, 'workflows', 'demo', 'policies'), { recursive: true });
      mkdirSync(join(root, 'processing', 'infrastructure'), { recursive: true });
      const failures = collectOwnershipFailures({
        files: [],
        allowlist: [],
        directories: listDirectories(root),
      });
      expect(failures.workflowInfrastructure).toEqual(['workflows/demo/infrastructure']);
      expect(failures.violations).toEqual([]);
      expect(failures.staleAllowlist).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('table inventory', () => {
  const namePattern = '(?:"[^"]*"|`[^`]*`|\\[[^\\]]*\\]|[A-Za-z_][A-Za-z0-9_]*)';
  const schemaStatement = new RegExp(
    `\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${namePattern})|\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${namePattern})|\\bALTER\\s+TABLE\\s+(${namePattern})\\s+RENAME\\s+TO\\s+(${namePattern})`,
    'gi'
  );

  const unquote = (raw: string): string => {
    const wrapped =
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith('`') && raw.endsWith('`')) ||
      (raw.startsWith('[') && raw.endsWith(']'));
    return wrapped ? raw.slice(1, -1) : raw;
  };

  const applySchemaLiterals = (literals: readonly string[], live: Set<string>): void => {
    for (const literal of literals) {
      for (const match of literal.matchAll(schemaStatement)) {
        const created = match[1];
        const dropped = match[2];
        const renamedFrom = match[3];
        const renamedTo = match[4];
        if (created !== undefined) {
          live.add(unquote(created));
        } else if (dropped !== undefined) {
          live.delete(unquote(dropped));
        } else if (renamedFrom !== undefined && renamedTo !== undefined) {
          live.delete(unquote(renamedFrom));
          live.add(unquote(renamedTo));
        }
      }
    }
  };

  it('matches the map to tables that survive the checked-in migrations, plus _migrations', () => {
    const files = scanSourceFiles(apiSrc);
    const byPath = new Map(files.map((file) => [file.path, file.literals]));
    const live = new Set<string>();
    applySchemaLiterals(byPath.get('platform/database/migrator.ts') ?? [], live);

    const migrationVersion = (path: string): number | undefined => {
      const match = /^platform\/database\/migrations\/(\d+)-/.exec(path);
      return match?.[1] === undefined ? undefined : Number(match[1]);
    };
    const migrationPaths = [...byPath.keys()]
      .filter((path) => {
        const version = migrationVersion(path);
        return version !== undefined && version >= 1;
      })
      .sort((left, right) => (migrationVersion(left) ?? 0) - (migrationVersion(right) ?? 0));
    const legacyPaths = migrationPaths.filter(
      (path) => (migrationVersion(path) ?? 0) <= LEGACY_MIGRATION_VERSION
    );
    expect(migrationVersion(legacyPaths[0] ?? '')).toBe(1);
    expect(migrationVersion(legacyPaths.at(-1) ?? '')).toBe(LEGACY_MIGRATION_VERSION);
    expect(migrationVersion(migrationPaths.at(-1) ?? '')).toBe(LEGACY_MIGRATION_VERSION + 1);

    for (const path of migrationPaths) {
      applySchemaLiterals(byPath.get(path) ?? [], live);
    }

    const schemaProbe = new RegExp(schemaStatement.source, 'i');
    const outside = files.filter((file) => {
      const version = migrationVersion(file.path);
      if (file.path === 'platform/database/migrator.ts') {
        return false;
      }
      if (version !== undefined && version >= 1) {
        return false;
      }
      return file.literals.some((literal) => schemaProbe.test(literal));
    });
    expect(outside.map((file) => file.path)).toEqual([]);

    for (const name of ['change_log_new', 'invitations_new', 'membership_events_v2', 'membership_events_v3']) {
      expect(live.has(name)).toBe(false);
    }

    const mapped = new Set<string>(Object.keys(TABLE_OWNERS));
    for (const name of live) {
      expect(mapped.has(name), name).toBe(true);
    }
    const missing = [...mapped].filter((name) => !live.has(name)).sort();
    expect(missing).toEqual([...PLANNED_TABLES]);
  });
});

describe('current tree', () => {
  const files = scanSourceFiles(apiSrc);
  const directories = listDirectories(apiSrc);

  it('passes with the checked-in allowlist and fails closed without it', () => {
    const bare = checkTableOwnership(files, []);
    expect(TABLE_OWNERSHIP_ALLOWLIST).toHaveLength(29);
    expect(TABLE_OWNERSHIP_ALLOWLIST).toHaveLength(bare.violations.length);
    const helperHits = files
      .filter((file) => file.path.startsWith('tests/helpers/'))
      .flatMap((file) => file.literals.flatMap(tableReferencesInLiteral));
    expect(helperHits.length).toBeGreaterThan(0);
    expect(
      checkTableOwnership(
        files.filter((file) => file.path.startsWith('tests/helpers/')),
        []
      ).violations
    ).toEqual([]);
    const failures = collectOwnershipFailures({
      files,
      allowlist: TABLE_OWNERSHIP_ALLOWLIST,
      directories,
    });
    expect(failures.violations).toEqual([]);
    expect(failures.staleAllowlist).toEqual([]);
    expect(failures.workflowInfrastructure).toEqual([]);
  });

  it('comments every allowlist entry with the task that removes it', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'table-ownership.allowlist.ts'),
      'utf8'
    );
    const lines = source.split('\n');
    let entries = 0;
    for (const [index, line] of lines.entries()) {
      const match = /removedBy: '([^']+)'/.exec(line);
      if (match?.[1] === undefined) {
        continue;
      }
      entries += 1;
      const task = match[1];
      expect(task).toMatch(/^M\d+\.\d+(?:-[a-z0-9]+)?$/);
      const nearby = lines.slice(Math.max(0, index - 12), index).join('\n');
      expect(nearby).toContain(`// ${task}`);
    }
    expect(entries).toBe(TABLE_OWNERSHIP_ALLOWLIST.length);
    const keys = TABLE_OWNERSHIP_ALLOWLIST.map(
      (entry) => `${entry.path}\0${entry.keyword}\0${entry.table}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sees the known cross-owner statements in the files the issue names', () => {
    const refsIn = (path: string) => {
      const file = files.find((candidate) => candidate.path === path);
      expect(file, path).toBeDefined();
      return (file?.literals ?? []).flatMap(tableReferencesInLiteral);
    };
    const count = (path: string, keyword: string, table: TableName): number =>
      refsIn(path).filter((reference) => reference.keyword === keyword && reference.table === table)
        .length;

    expect(count('processing/infrastructure/process-row-statements.ts', 'FROM', 'captures')).toBe(1);
    expect(count('processing/infrastructure/process-row-statements.ts', 'UPDATE', 'captures')).toBe(1);
    expect(
      count(
        'modules/task-management/infrastructure/persistence/rows/task-row-statements.ts',
        'UPDATE',
        'captures'
      )
    ).toBe(1);
    expect(count('modules/history/infrastructure/sql.ts', 'FROM', 'tasks')).toBe(2);
    expect(count('modules/history/infrastructure/sql.ts', 'INTO', 'change_log')).toBe(1);
    expect(count('notes/infrastructure/note-row-statements.ts', 'JOIN', 'users')).toBe(4);
    expect(count('notes/infrastructure/note-row-statements.ts', 'FROM', 'project_notes')).toBe(2);
    expect(count('platform/sql/page-sqlite.ts', 'FROM', 'tasks')).toBe(0);
    expect(
      refsIn('edges/test-fixtures/http-ownerless-workspace-fixture-routes.ts')
    ).toEqual([]);
  });
});

describe('migration ownership', () => {
  const nextVersion = LEGACY_MIGRATION_VERSION + 1;
  const up = async (): Promise<void> => {};

  const declared = (
    version: number,
    source: string,
    fields: { owner?: string; reason?: string } = {}
  ) =>
    checkMigrationOwnership({
      version,
      ...readMigrationFields(source),
      ...fields,
      literals: stringLiteralsInTypescript(source),
    });

  it('keeps the migration owner union aligned with the table modules', () => {
    expect(moduleOwnersMatchMigrationOwners).toBe(true);
    expect(legacyMigrationCutoffIs43).toBe(true);
  });

  it('types a legacy migration without an owner and requires one after it', () => {
    const legacy: Migration = {
      version: LEGACY_MIGRATION_VERSION,
      name: 'legacy',
      up,
    };
    const owned: Migration = {
      version: nextVersion,
      name: 'owned',
      owner: 'notes',
      up,
    };
    const platform: Migration = {
      version: nextVersion,
      name: 'platform',
      owner: 'platform',
      reason: 'backfill spans modules',
      up,
    };
    expect(legacy.owner).toBeUndefined();
    expect(owned.owner).toBe('notes');
    expect(platform.reason).toBe('backfill spans modules');

    // @ts-expect-error a migration after 043 declares an owner
    const missingOwner: Migration = { version: nextVersion, name: 'missing', up };
    // @ts-expect-error a platform migration declares a written reason
    const platformWithoutReason: Migration = {
      version: nextVersion,
      name: 'platform',
      owner: 'platform',
      up,
    };
    expect(missingOwner.name).toBe('missing');
    expect(platformWithoutReason.owner).toBe('platform');
  });

  it('allows an owned migration to create, alter, rebuild, and backfill its own tables', () => {
    const failures = declared(
      nextVersion,
      `
        export const migration = {
          owner: 'task-management',
          up: async (db) => {
            await db.batch([
              { sql: 'CREATE TABLE IF NOT EXISTS tasks (id TEXT, project_id TEXT REFERENCES projects(id))' },
              { sql: 'ALTER TABLE lists ADD COLUMN position INTEGER' },
              { sql: 'INSERT INTO tasks (id) SELECT id FROM projects' },
              { sql: 'UPDATE tasks SET project_id = NULL' },
            ]);
          },
        };
      `
    );
    expect(failures).toEqual([]);
  });

  it('rejects a migration that touches another module table', () => {
    expect(
      declared(nextVersion, 'export const sql = "ALTER TABLE tasks ADD COLUMN x TEXT";', {
        owner: 'notes',
      })
    ).toEqual([
      {
        kind: 'cross-owner-table',
        version: nextVersion,
        keyword: 'TABLE',
        table: 'tasks',
      },
    ]);
  });

  it('rejects a new foreign key to another module and allows an identity anchor', () => {
    expect(
      declared(nextVersion, 'export const sql = "REFERENCES projects(id)";', { owner: 'notes' })
    ).toEqual([
      { kind: 'cross-module-foreign-key', version: nextVersion, table: 'projects' },
    ]);
    expect(
      declared(nextVersion, 'export const sql = "REFERENCES organizations(name)";', {
        owner: 'notes',
      })
    ).toEqual([
      { kind: 'cross-module-foreign-key', version: nextVersion, table: 'organizations' },
    ]);
    expect(
      declared(
        nextVersion,
        'export const sql = "REFERENCES organizations(id), REFERENCES users(id)";',
        { owner: 'notes' }
      )
    ).toEqual([]);
    expect(
      declared(
        nextVersion,
        'export const sql = "REFERENCES organizations ( id ), REFERENCES \\"users\\" ( id )";',
        { owner: 'captures' }
      )
    ).toEqual([]);
  });

  it('allows a platform migration with a reason to touch other tables, not to add their foreign keys', () => {
    expect(
      declared(
        nextVersion,
        `
          export const sql = "UPDATE tasks SET deleted_at = ?";
          export const more = "INSERT INTO captures (id) VALUES (?)";
        `,
        { owner: 'platform', reason: 'one backfill before the split' }
      )
    ).toEqual([]);
    expect(
      declared(nextVersion, 'export const sql = "REFERENCES captures(id)";', {
        owner: 'platform',
        reason: 'one backfill before the split',
      })
    ).toEqual([
      { kind: 'cross-module-foreign-key', version: nextVersion, table: 'captures' },
    ]);
    expect(
      declared(nextVersion, 'export const sql = "REFERENCES users(id)";', {
        owner: 'platform',
        reason: 'anchor stays',
      })
    ).toEqual([]);
  });

  it('rejects a platform migration whose reason is missing or blank when it crosses modules', () => {
    expect(
      declared(nextVersion, 'export const sql = "UPDATE tasks SET deleted_at = ?";', {
        owner: 'platform',
        reason: '   ',
      })
    ).toEqual([
      { kind: 'platform-reason', version: nextVersion },
      {
        kind: 'cross-owner-table',
        version: nextVersion,
        keyword: 'UPDATE',
        table: 'tasks',
      },
    ]);
    expect(
      declared(nextVersion, 'export const sql = "CREATE TABLE _migrations (version INTEGER)";', {
        owner: 'platform',
      })
    ).toEqual([{ kind: 'platform-reason', version: nextVersion }]);
  });

  it('rejects a missing or unknown owner without dropping the table hit', () => {
    expect(declared(nextVersion, 'export const sql = "CREATE TABLE tasks (id TEXT)";')).toEqual([
      { kind: 'missing-owner', version: nextVersion },
      {
        kind: 'cross-owner-table',
        version: nextVersion,
        keyword: 'TABLE',
        table: 'tasks',
      },
    ]);
    expect(
      declared(nextVersion, 'export const sql = "FROM tasks";', { owner: 'processing' })
    ).toEqual([
      { kind: 'invalid-owner', version: nextVersion, owner: 'processing' },
      {
        kind: 'cross-owner-table',
        version: nextVersion,
        keyword: 'FROM',
        table: 'tasks',
      },
    ]);
  });

  it('does not flag legacy migrations, including their cross-module foreign keys', () => {
    expect(
      declared(
        LEGACY_MIGRATION_VERSION,
        'export const sql = "REFERENCES captures(id)"; export const more = "UPDATE tasks SET x = 1";'
      )
    ).toEqual([]);
  });

  it('reads owner and reason from a fixture source and ignores comments and string contents', () => {
    const source = `
      // owner: 'access'
      const label = "owner: 'captures'";
      export const migration = {
        version: ${nextVersion},
        name: 'fixture',
        owner: "task-management",
        reason: 'not used for a module owner',
        up: async () => {},
      };
    `;
    expect(readMigrationFields(source)).toEqual({
      owner: 'task-management',
      reason: 'not used for a module owner',
    });
    expect(readMigrationFields("export const owner = 'notes';")).toEqual({});
    expect(readMigrationFields('export const migration = { owner: `notes` };')).toEqual({});
    const fields = readMigrationFields(`
      export const migration = {
        owner: 'platform',
        reason: 'it\\'s a span',
      };
    `);
    expect(fields.owner).toBe('platform');
    expect(fields.reason).toBe("it's a span");
    expect(
      checkMigrationOwnership({
        version: nextVersion,
        ...readMigrationFields(`
          export const migration = {
            owner: 'notes',
            up: async (db) => {
              await db.execute({ sql: 'CREATE TABLE notes_settings (id TEXT)' });
            },
          };
        `),
        literals: stringLiteralsInTypescript(`
          export const migration = {
            owner: 'notes',
            up: async (db) => {
              await db.execute({ sql: 'CREATE TABLE notes_settings (id TEXT)' });
            },
          };
        `),
      })
    ).toEqual([]);
  });

  it('matches the checked-in sequence and leaves 001 through the legacy cutoff exempt', () => {
    const indexed = migrations.map((migration) => migration.version).sort((left, right) => left - right);
    expect(indexed).toEqual(
      Array.from({ length: LEGACY_MIGRATION_VERSION + 1 }, (_, index) => index + 1)
    );
    expect(Math.max(...indexed)).toBe(nextVersion);

    const files = scanSourceFiles(apiSrc);
    const onDisk = files
      .map((file) => /^platform\/database\/migrations\/(\d+)-[^/]+\.ts$/.exec(file.path))
      .flatMap((match) => (match?.[1] === undefined ? [] : [Number(match[1])]))
      .sort((left, right) => left - right);
    expect(onDisk).toEqual(indexed);

    for (const version of indexed) {
      const padded = String(version).padStart(3, '0');
      const file = files.find((candidate) =>
        candidate.path.startsWith(`platform/database/migrations/${padded}-`)
      );
      expect(file, padded).toBeDefined();
      const source = readFileSync(join(apiSrc, file?.path ?? ''), 'utf8');
      expect(
        checkMigrationOwnership({
          version,
          ...readMigrationFields(source),
          literals: stringLiteralsInTypescript(source),
        })
      ).toEqual([]);
    }
  });
});
