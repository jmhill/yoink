import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TABLE_OWNERSHIP_ALLOWLIST } from './table-ownership.allowlist.js';
import {
  FIXTURE_ROUTE_PATHS,
  LEGACY_MIGRATION_VERSION,
  PLANNED_TABLES,
  TABLE_OWNERS,
  checkTableOwnership,
  classifyApiPath,
  collectOwnershipFailures,
  isWorkflowInfrastructurePath,
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
    expect(classifyApiPath('shared/change-log/infrastructure/sql.ts')).toEqual({
      kind: 'module-infrastructure',
      owner: 'history',
    });
    expect(classifyApiPath('review/domain/build-review.ts')).toEqual({
      kind: 'module-other',
      owner: 'review',
    });
    expect(classifyApiPath('database/migrator.ts')).toEqual({ kind: 'platform' });
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
    expect(classifyApiPath('listing/infrastructure/page-sqlite.ts')).toEqual({
      kind: 'no-sql',
      area: 'listing',
    });
    expect(classifyApiPath(`database/migrations/0${LEGACY_MIGRATION_VERSION}-owner-invites.ts`)).toEqual({
      kind: 'exempt',
      reason: 'legacy-migration',
    });
    expect(classifyApiPath('database/migrations/044-next.ts')).toEqual({ kind: 'platform' });
    expect(classifyApiPath('tasks/infrastructure/task-row-statements.test.ts')).toEqual({
      kind: 'exempt',
      reason: 'test-file',
    });
    for (const path of FIXTURE_ROUTE_PATHS) {
      expect(classifyApiPath(path)).toEqual({ kind: 'no-sql', area: 'fixture-route' });
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
        'database/migrations/043-legacy.ts',
        'export const sql = "REFERENCES captures(id)";'
      ),
      scanned(
        'database/migrations/044-new.ts',
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
        path: 'database/migrations/044-new.ts',
        keyword: 'TABLE',
        table: 'tasks',
        count: 1,
      },
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

  it('matches the map to tables that survive migrations 001-043, plus _migrations', () => {
    const files = scanSourceFiles(apiSrc);
    const byPath = new Map(files.map((file) => [file.path, file.literals]));
    const live = new Set<string>();
    applySchemaLiterals(byPath.get('database/migrator.ts') ?? [], live);

    const migrationVersion = (path: string): number | undefined => {
      const match = /^database\/migrations\/(\d+)-/.exec(path);
      return match?.[1] === undefined ? undefined : Number(match[1]);
    };
    const migrationPaths = [...byPath.keys()]
      .filter((path) => {
        const version = migrationVersion(path);
        return version !== undefined && version >= 1 && version <= LEGACY_MIGRATION_VERSION;
      })
      .sort((left, right) => (migrationVersion(left) ?? 0) - (migrationVersion(right) ?? 0));
    expect(migrationVersion(migrationPaths[0] ?? '')).toBe(1);
    expect(migrationVersion(migrationPaths.at(-1) ?? '')).toBe(LEGACY_MIGRATION_VERSION);

    for (const path of migrationPaths) {
      applySchemaLiterals(byPath.get(path) ?? [], live);
    }

    const schemaProbe = new RegExp(schemaStatement.source, 'i');
    const outside = files.filter((file) => {
      const version = migrationVersion(file.path);
      if (file.path === 'database/migrator.ts') {
        return false;
      }
      if (version !== undefined && version >= 1 && version <= LEGACY_MIGRATION_VERSION) {
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
    expect(TABLE_OWNERSHIP_ALLOWLIST).toHaveLength(bare.violations.length);
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
    expect(count('tasks/infrastructure/task-row-statements.ts', 'UPDATE', 'captures')).toBe(1);
    expect(count('shared/change-log/infrastructure/sql.ts', 'FROM', 'tasks')).toBe(2);
    expect(count('shared/change-log/infrastructure/sql.ts', 'INTO', 'change_log')).toBe(1);
    expect(count('notes/infrastructure/note-row-statements.ts', 'JOIN', 'users')).toBe(4);
    expect(count('notes/infrastructure/note-row-statements.ts', 'FROM', 'project_notes')).toBe(2);
    expect(count('listing/infrastructure/page-sqlite.ts', 'FROM', 'tasks')).toBe(0);
    expect(
      refsIn('access/infrastructure/http-ownerless-workspace-fixture-routes.ts')
    ).toEqual([]);
  });
});
