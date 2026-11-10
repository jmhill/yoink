/**
 * Table ownership for ADR-001 §5.1 and the §10 architecture test (M1.2).
 *
 * `platform/` does not exist as a moved tree until M2.2. M2.2 must keep this
 * file and update {@link classifyApiPath} when files move. The current-layout
 * branch of that function is the compatibility map for today's directories.
 * M2.1 put pure shared and listing code under `kernel/`. That branch is
 * already no-sql. M4.2 moved the change log and the history tree to
 * `modules/history/`, which the modules branch owns. The `shared/change-log`
 * branch stays so a file put back there is still history.
 *
 * This module is not wired into the server. Nothing in `app.ts` or the
 * composition root should import it.
 *
 * ## What the scanner is
 *
 * It is a heuristic, not a SQL parser. ADR §10: match the keywords `FROM`,
 * `JOIN`, `INTO`, `UPDATE`, `TABLE`, and `REFERENCES` followed by a table name
 * inside a string literal. A name counts only when it is a key of
 * {@link TABLE_OWNERS}.
 *
 * String literals come from {@link stringLiteralsInTypescript}, a small
 * TypeScript lexer (quotes, templates, comments, and a practical regex
 * skipper). It is not the TypeScript compiler. Template `${...}` parts are
 * separate literals and are not concatenated, so a table name built by
 * interpolation is invisible.
 *
 * Also counted, because this code builds FROM-clause fragments that way: a
 * literal whose first token is a mapped table name, then an alias, then a
 * newline or the end of the literal (`tasks t` / `project_notes n`). That is
 * still a keyword-shaped `FROM`, not a parse of the statement.
 *
 * ## What it does not see
 *
 * - Comments, including JSDoc examples.
 * - `*.test.ts` files (the walker and {@link classifyApiPath} both skip them).
 * - `src/tests/helpers/**` only. That directory holds test-support helpers
 *   that are not test suites. A file anywhere else, including the rest of
 *   `src/tests/`, is not this exemption. Production paths are not exempt.
 * - Migrations `001`–`043`. A later migration file is not platform code: the
 *   path rule skips it, and {@link checkMigrationOwnership} applies the owner,
 *   reason, and foreign-key rules. That checker is still this keyword
 *   heuristic. It does not parse `ALTER` columns or backfill prose.
 * - A table named only by interpolation: `` `FROM ${options.from}` ``,
 *   `pageSqlite({ from: 'tasks' })`, `PRAGMA table_info(${table})`, and
 *   `hasColumn(db, 'users', ...)`.
 * - The second table of a comma join (`FROM a, b`).
 * - `UPDATE OR <verb> table`, and trigger syntax `UPDATE ON table`.
 * - A dotted name other than one optional qualifier (`main.tasks` counts as
 *   `tasks`; `a.b.tasks` does not).
 * - Quoted identifiers with escaped quotes (`"ta""ble"`).
 * - Identifiers that are not in {@link TABLE_OWNERS} (`sqlite_master`,
 *   CTEs, aliases, and the temporary rebuild names `change_log_new`,
 *   `invitations_new`, `membership_events_v2`, `membership_events_v3`).
 * - Opaque id columns (`capture_id`, `project_id`). Those are not table
 *   references.
 *
 * A miss is a scanner boundary. A hit is never removed by weakening the
 * match. Fix a false positive by restructuring the code or by a commented
 * allowlist entry.
 *
 * ## Who may name a table
 *
 * Only the owning module's `infrastructure/` may name its tables. Platform
 * may name platform tables from platform code (`database/` today,
 * `platform/` after M2.2). Workflows, edges, kernel, and every other area
 * may not name a table. `edges/test-fixtures/` is exempt. M7.4 retires
 * those routes.
 *
 * `REFERENCES organizations(id)` and `REFERENCES users(id)` are the identity
 * anchors from ADR §5.1. They are not violations. Any other reference to
 * `users` or `organizations` is. Review owns no table. The unit-of-work
 * guard table has no name until M4.1; add that name here when it exists.
 * `notes_settings` is in the map (M5.8a created it). It stays empty until
 * M5.8b. The old organization column stays the source of truth until M5.8c.
 *
 * A migration after {@link LEGACY_MIGRATION_VERSION} declares `owner` and,
 * for `platform`, a non-empty `reason` (`owner: 'platform'` / `reason: '...'`
 * with `'` or `"`). {@link readMigrationFields} does not read a template
 * literal or an unquoted owner. Comments and string contents are not
 * declarations.
 */

import {
  LEGACY_MIGRATION_VERSION,
  MIGRATION_OWNERS,
  type MigrationOwner,
} from './database/types.js';
import type { ModuleName } from '../kernel/module-name.js';

export { LEGACY_MIGRATION_VERSION };
export type { ModuleName };

type ModuleOwnersMatch =
  (<T>() => T extends ModuleName ? 1 : 2) extends
  (<T>() => T extends Exclude<MigrationOwner, 'platform'> ? 1 : 2)
    ? true
    : false;

/** Compile-time lock: the migration owner union and the table-owner modules stay the same. */
export const moduleOwnersMatchMigrationOwners: ModuleOwnersMatch = true;

export type TableOwner = ModuleName | 'platform';

export const TABLE_OWNERS = {
  users: 'access',
  organizations: 'access',
  organization_memberships: 'access',
  membership_events: 'access',
  invitations: 'access',
  api_tokens: 'access',
  passkey_credentials: 'access',
  user_sessions: 'access',
  captures: 'captures',
  tasks: 'task-management',
  projects: 'task-management',
  lists: 'task-management',
  project_imports: 'task-management',
  project_notes: 'notes',
  notes_settings: 'notes',
  change_log: 'history',
  _migrations: 'platform',
} as const satisfies Record<string, TableOwner>;

export type TableName = keyof typeof TABLE_OWNERS;

/** In the map before a migration creates it. M5.8a created `notes_settings`. */
export const PLANNED_TABLES = [] as const satisfies readonly TableName[];

export const SQL_KEYWORDS = ['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'REFERENCES'] as const;

export type SqlKeyword = (typeof SQL_KEYWORDS)[number];

const IDENTITY_ANCHOR_TABLES = new Set<TableName>(['organizations', 'users']);

export const FIXTURE_ROUTE_PATHS = [
  'edges/test-fixtures/http-ownerless-workspace-fixture-routes.ts',
  'edges/test-fixtures/http-review-fixture-routes.ts',
] as const;

export type FileRole =
  | {
      kind: 'exempt';
      reason: 'test-file' | 'test-support' | 'legacy-migration' | 'later-migration' | 'test-fixtures';
    }
  | { kind: 'module-infrastructure'; owner: ModuleName }
  | { kind: 'module-other'; owner: ModuleName }
  | { kind: 'platform' }
  | { kind: 'no-sql'; area: string };

export type TableReference = {
  keyword: SqlKeyword;
  table: TableName;
  /** `REFERENCES organizations(id)` or `REFERENCES users(id)` only. */
  identityAnchor: boolean;
};

export type ScannedSourceFile = {
  /** Posix path relative to `apps/api/src`. */
  path: string;
  literals: readonly string[];
};

export type OwnershipViolation = {
  path: string;
  keyword: SqlKeyword;
  table: TableName;
  count: number;
};

export type TableOwnershipAllowlistEntry = {
  path: string;
  keyword: SqlKeyword;
  table: TableName;
  count: number;
  /** Task that removes this exception. */
  removedBy: string;
};

export type OwnershipReport = {
  violations: OwnershipViolation[];
  staleAllowlist: TableOwnershipAllowlistEntry[];
};

const MODULE_DIRECTORY_OWNERS = {
  access: 'access',
  captures: 'captures',
  'task-management': 'task-management',
  notes: 'notes',
  review: 'review',
  history: 'history',
} as const satisfies Record<ModuleName, ModuleName>;

const TARGET_MODULE: Record<string, ModuleName> = MODULE_DIRECTORY_OWNERS;

const CURRENT_MODULE_ROOT: Record<string, ModuleName> = {
  access: 'access',
  captures: 'captures',
  tasks: 'task-management',
  projects: 'task-management',
  lists: 'task-management',
  notes: 'notes',
  review: 'review',
  history: 'history',
};

// Leftover roots. M2.2 moved these trees under platform/; a file still here
// stays platform rather than becoming unmapped.
const CURRENT_PLATFORM_ROOTS = new Set(['database', 'config', 'logging', 'health']);

const TABLE_NAME_BY_LOWER = new Map<string, TableName>(
  (Object.keys(TABLE_OWNERS) as TableName[]).map((name) => [name.toLowerCase(), name])
);

const NOT_AN_ALIAS = new Set([
  'AS',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'CROSS',
  'FULL',
  'NATURAL',
  'WHERE',
  'SET',
  'ON',
  'SELECT',
  'FROM',
  'GROUP',
  'ORDER',
  'LIMIT',
  'UNION',
  'AND',
  'OR',
]);

export const normalizeApiPath = (path: string): string =>
  path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');

export const isWorkflowInfrastructurePath = (relativePath: string): boolean =>
  /^workflows\/[^/]+\/infrastructure$/.test(normalizeApiPath(relativePath));

const moduleRole = (
  segments: readonly string[],
  owner: ModuleName,
  infrastructureFrom: number
): FileRole =>
  segments.slice(infrastructureFrom).includes('infrastructure')
    ? { kind: 'module-infrastructure', owner }
    : { kind: 'module-other', owner };

export const classifyApiPath = (relativePath: string): FileRole => {
  const path = normalizeApiPath(relativePath);
  if (path.endsWith('.test.ts')) {
    return { kind: 'exempt', reason: 'test-file' };
  }
  // Test-support helpers only. `tests/helpers.ts` and `tests/helpers-extra/` do not match.
  if (path.startsWith('tests/helpers/')) {
    return { kind: 'exempt', reason: 'test-support' };
  }
  if (path === 'edges/test-fixtures' || path.startsWith('edges/test-fixtures/')) {
    return { kind: 'exempt', reason: 'test-fixtures' };
  }
  // M2.2 moved the tree under platform/database. 001–043 stay exempt.
  const migrationFile = /^platform\/database\/migrations\/(\d+)-[^/]+\.ts$/.exec(path);
  if (migrationFile?.[1] !== undefined) {
    const version = Number(migrationFile[1]);
    return {
      kind: 'exempt',
      reason: version <= LEGACY_MIGRATION_VERSION ? 'legacy-migration' : 'later-migration',
    };
  }

  const segments = path.split('/');
  const root = segments[0];
  const second = segments[1];

  if (root === 'modules' && second !== undefined && second in TARGET_MODULE) {
    const owner = TARGET_MODULE[second];
    if (owner !== undefined) {
      return moduleRole(segments, owner, 2);
    }
  }
  if (root === 'workflows') {
    return { kind: 'no-sql', area: 'workflow' };
  }
  if (root === 'edges') {
    return { kind: 'no-sql', area: 'edge' };
  }
  if (root === 'platform') {
    return { kind: 'platform' };
  }
  // Pure files moved here in M2.1. No SQL, so this stays no-sql.
  if (root === 'kernel') {
    return { kind: 'no-sql', area: 'kernel' };
  }
  if (root === 'shared' && second === 'change-log') {
    return moduleRole(segments, 'history', 2);
  }
  if (root !== undefined && root in CURRENT_MODULE_ROOT) {
    const owner = CURRENT_MODULE_ROOT[root];
    if (owner !== undefined) {
      return moduleRole(segments, owner, 1);
    }
  }
  if (root === 'work') {
    return { kind: 'no-sql', area: 'work' };
  }
  if (root === 'processing') {
    return { kind: 'no-sql', area: 'processing' };
  }
  if (root !== undefined && CURRENT_PLATFORM_ROOTS.has(root)) {
    return { kind: 'platform' };
  }
  if (root === 'listing' || root === 'shared' || root === 'tests') {
    return { kind: 'no-sql', area: root };
  }
  return { kind: 'no-sql', area: 'unmapped' };
};

const IDENTIFIER =
  /^(?:"([^"]*)"|`([^`]*)`|\[([^\]]*)\]|([A-Za-z_][A-Za-z0-9_]*))/;

const readIdentifier = (
  text: string,
  index: number
): { name: string; end: number } | undefined => {
  const match = IDENTIFIER.exec(text.slice(index));
  if (match === null || match.index !== 0) {
    return undefined;
  }
  const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
  if (name.length === 0) {
    return undefined;
  }
  return { name, end: index + match[0].length };
};

const skipWhitespace = (text: string, index: number): number => {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
};

const mappedTable = (name: string): TableName | undefined =>
  TABLE_NAME_BY_LOWER.get(name.toLowerCase());

const identityAnchorAt = (text: string, tableEnd: number, table: TableName): boolean => {
  if (!IDENTITY_ANCHOR_TABLES.has(table)) {
    return false;
  }
  const open = skipWhitespace(text, tableEnd);
  if (text[open] !== '(') {
    return false;
  }
  const column = readIdentifier(text, skipWhitespace(text, open + 1));
  if (column === undefined || column.name.toLowerCase() !== 'id') {
    return false;
  }
  return text[skipWhitespace(text, column.end)] === ')';
};

const keywordReferenceAt = (
  text: string,
  keyword: SqlKeyword,
  keywordEnd: number
): TableReference | undefined => {
  let cursor = skipWhitespace(text, keywordEnd);
  if (keyword === 'TABLE') {
    const ifNotExists = /^IF\s+NOT\s+EXISTS\b/i.exec(text.slice(cursor));
    if (ifNotExists !== null) {
      cursor = skipWhitespace(text, cursor + ifNotExists[0].length);
    }
  }

  const first = readIdentifier(text, cursor);
  if (first === undefined) {
    return undefined;
  }
  let tableName = first.name;
  let tableEnd = first.end;
  const dot = skipWhitespace(text, first.end);
  if (text[dot] === '.') {
    const second = readIdentifier(text, skipWhitespace(text, dot + 1));
    if (second !== undefined && mappedTable(second.name) !== undefined) {
      tableName = second.name;
      tableEnd = second.end;
    }
  }

  const table = mappedTable(tableName);
  if (table === undefined) {
    return undefined;
  }
  return {
    keyword,
    table,
    identityAnchor: keyword === 'REFERENCES' && identityAnchorAt(text, tableEnd, table),
  };
};

const pushReference = (references: TableReference[], reference: TableReference | undefined): void => {
  if (reference !== undefined) {
    references.push(reference);
  }
};

const leadingFragmentReference = (literal: string): TableReference | undefined => {
  const match =
    /^\s*(?:"([^"]*)"|`([^`]*)`|\[([^\]]*)\]|([A-Za-z_][A-Za-z0-9_]*))\s+(?:AS\s+)?(?:"([^"]*)"|`([^`]*)`|\[([^\]]*)\]|([A-Za-z_][A-Za-z0-9_]*))\s*(?:\n|$)/i.exec(
      literal
    );
  if (match === null) {
    return undefined;
  }
  const table = mappedTable(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
  const alias = (match[5] ?? match[6] ?? match[7] ?? match[8] ?? '').toUpperCase();
  if (table === undefined || alias.length === 0 || NOT_AN_ALIAS.has(alias)) {
    return undefined;
  }
  return { keyword: 'FROM', table, identityAnchor: false };
};

export const tableReferencesInLiteral = (literal: string): TableReference[] => {
  const references: TableReference[] = [];
  pushReference(references, leadingFragmentReference(literal));

  const keywordPattern = /\b(FROM|JOIN|INTO|UPDATE|TABLE|REFERENCES)\b/gi;
  for (const match of literal.matchAll(keywordPattern)) {
    const keywordText = match[1];
    if (keywordText === undefined || match.index === undefined) {
      continue;
    }
    const keyword = keywordText.toUpperCase() as SqlKeyword;
    pushReference(references, keywordReferenceAt(literal, keyword, match.index + keywordText.length));
  }
  return references;
};

const referenceAllowed = (role: FileRole, reference: TableReference): boolean => {
  if (reference.identityAnchor || role.kind === 'exempt') {
    return true;
  }
  const owner = TABLE_OWNERS[reference.table];
  if (role.kind === 'module-infrastructure') {
    return role.owner === owner;
  }
  if (role.kind === 'platform') {
    return owner === 'platform';
  }
  return false;
};

const violationKey = (path: string, keyword: SqlKeyword, table: TableName): string =>
  `${normalizeApiPath(path)}\0${keyword}\0${table}`;

const compareViolation = (left: OwnershipViolation, right: OwnershipViolation): number =>
  violationKey(left.path, left.keyword, left.table).localeCompare(
    violationKey(right.path, right.keyword, right.table)
  );

export const checkTableOwnership = (
  files: readonly ScannedSourceFile[],
  allowlist: readonly TableOwnershipAllowlistEntry[]
): OwnershipReport => {
  const counts = new Map<string, OwnershipViolation>();
  for (const file of files) {
    const path = normalizeApiPath(file.path);
    const role = classifyApiPath(path);
    for (const literal of file.literals) {
      for (const reference of tableReferencesInLiteral(literal)) {
        if (referenceAllowed(role, reference)) {
          continue;
        }
        const key = violationKey(path, reference.keyword, reference.table);
        const existing = counts.get(key);
        if (existing === undefined) {
          counts.set(key, { path, keyword: reference.keyword, table: reference.table, count: 1 });
        } else {
          existing.count += 1;
        }
      }
    }
  }

  const allowlistByKey = new Map<string, TableOwnershipAllowlistEntry>();
  const staleAllowlist: TableOwnershipAllowlistEntry[] = [];
  for (const entry of allowlist) {
    const key = violationKey(entry.path, entry.keyword, entry.table);
    if (allowlistByKey.has(key)) {
      staleAllowlist.push(entry);
      continue;
    }
    allowlistByKey.set(key, entry);
    const actual = counts.get(key);
    if (actual === undefined || actual.count !== entry.count) {
      staleAllowlist.push(entry);
    }
  }

  const violations: OwnershipViolation[] = [];
  for (const [key, actual] of counts) {
    const entry = allowlistByKey.get(key);
    if (entry === undefined || entry.count !== actual.count) {
      violations.push(actual);
    }
  }

  violations.sort(compareViolation);
  staleAllowlist.sort((left, right) =>
    violationKey(left.path, left.keyword, left.table).localeCompare(
      violationKey(right.path, right.keyword, right.table)
    )
  );
  return { violations, staleAllowlist };
};

export const collectOwnershipFailures = (input: {
  files: readonly ScannedSourceFile[];
  allowlist: readonly TableOwnershipAllowlistEntry[];
  /** Posix directory paths relative to `apps/api/src`. */
  directories: readonly string[];
}): OwnershipReport & { workflowInfrastructure: string[] } => ({
  ...checkTableOwnership(input.files, input.allowlist),
  workflowInfrastructure: input.directories.filter(isWorkflowInfrastructurePath).sort(),
});

export type MigrationOwnershipFailure =
  | { kind: 'missing-owner'; version: number }
  | { kind: 'invalid-owner'; version: number; owner: string }
  | { kind: 'platform-reason'; version: number }
  | { kind: 'cross-module-foreign-key'; version: number; table: TableName }
  | {
      kind: 'cross-owner-table';
      version: number;
      keyword: SqlKeyword;
      table: TableName;
    };

export type DeclaredMigration = {
  version: number;
  owner?: string;
  reason?: string;
  literals: readonly string[];
};

const MIGRATION_OWNER_SET = new Set<string>(MIGRATION_OWNERS);

const writtenReason = (reason: string | undefined): boolean =>
  reason !== undefined && reason.trim().length > 0;

const failureRank: Record<MigrationOwnershipFailure['kind'], number> = {
  'missing-owner': 0,
  'invalid-owner': 1,
  'platform-reason': 2,
  'cross-module-foreign-key': 3,
  'cross-owner-table': 4,
};

const failureKey = (failure: MigrationOwnershipFailure): string => {
  switch (failure.kind) {
    case 'missing-owner':
    case 'platform-reason':
      return failure.kind;
    case 'invalid-owner':
      return `${failure.kind}\0${failure.owner}`;
    case 'cross-module-foreign-key':
      return `${failure.kind}\0${failure.table}`;
    case 'cross-owner-table':
      return `${failure.kind}\0${failure.keyword}\0${failure.table}`;
  }
};

/**
 * Ownership rules for a migration newer than {@link LEGACY_MIGRATION_VERSION}.
 * Legacy versions return no failures. This does not run the migration.
 */
export const checkMigrationOwnership = (
  migration: DeclaredMigration
): MigrationOwnershipFailure[] => {
  if (migration.version <= LEGACY_MIGRATION_VERSION) {
    return [];
  }

  const failures: MigrationOwnershipFailure[] = [];
  const seen = new Set<string>();
  const push = (failure: MigrationOwnershipFailure): void => {
    const key = failureKey(failure);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    failures.push(failure);
  };

  const owner = migration.owner;
  const known = owner !== undefined && MIGRATION_OWNER_SET.has(owner);
  if (owner === undefined || owner.trim() === '') {
    push({ kind: 'missing-owner', version: migration.version });
  } else if (!known) {
    push({ kind: 'invalid-owner', version: migration.version, owner });
  } else if (owner === 'platform' && !writtenReason(migration.reason)) {
    push({ kind: 'platform-reason', version: migration.version });
  }

  const moduleOwner = known && owner !== 'platform' ? owner : undefined;
  const platformException = owner === 'platform' && writtenReason(migration.reason);

  for (const literal of migration.literals) {
    for (const reference of tableReferencesInLiteral(literal)) {
      if (reference.identityAnchor) {
        continue;
      }
      const tableOwner = TABLE_OWNERS[reference.table];
      if (reference.keyword === 'REFERENCES') {
        const sameModule = moduleOwner !== undefined && tableOwner === moduleOwner;
        const platformTable = owner === 'platform' && tableOwner === 'platform';
        if (!sameModule && !platformTable) {
          push({
            kind: 'cross-module-foreign-key',
            version: migration.version,
            table: reference.table,
          });
        }
        continue;
      }
      if (platformException) {
        continue;
      }
      if (moduleOwner !== undefined && tableOwner === moduleOwner) {
        continue;
      }
      if (owner === 'platform' && tableOwner === 'platform') {
        continue;
      }
      push({
        kind: 'cross-owner-table',
        version: migration.version,
        keyword: reference.keyword,
        table: reference.table,
      });
    }
  }

  failures.sort((left, right) => {
    const rank = failureRank[left.kind] - failureRank[right.kind];
    if (rank !== 0) {
      return rank;
    }
    return failureKey(left).localeCompare(failureKey(right));
  });
  return failures;
};

// --- TypeScript string literals. Not a SQL parser and not the TS compiler. ---

type ScanCursor = {
  index: number;
  slashIsRegex: boolean;
  /** Set only while reading `owner` / `reason` declarations. */
  fields?: { owner?: string; reason?: string };
  property?: 'owner' | 'reason';
  awaitingValue?: boolean;
};

const dropMigrationField = (cursor: ScanCursor): void => {
  if (cursor.fields === undefined) {
    return;
  }
  cursor.property = undefined;
  cursor.awaitingValue = false;
};

const REGEX_AFTER_WORD = new Set([
  'return',
  'throw',
  'case',
  'else',
  'do',
  'void',
  'typeof',
  'delete',
  'yield',
  'await',
  'of',
  'in',
]);

const REGEX_AFTER_PUNCT = new Set([
  '(',
  '[',
  ',',
  ';',
  ':',
  '?',
  '=',
  '<',
  '>',
  '!',
  '&',
  '|',
  '~',
  '^',
  '%',
  '*',
  '+',
  '-',
]);

const isIdentStart = (char: string): boolean =>
  /[A-Za-z_$]/.test(char) || char.charCodeAt(0) > 127;

const isIdentPart = (char: string): boolean =>
  /[A-Za-z0-9_$]/.test(char) || char.charCodeAt(0) > 127;

const isDigit = (char: string | undefined): boolean => char !== undefined && char >= '0' && char <= '9';

const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  "'": "'",
  '"': '"',
  '`': '`',
  '\\': '\\',
};

const decodeEscape = (source: string, cursor: ScanCursor): string => {
  const next = source[cursor.index + 1];
  if (next === undefined) {
    cursor.index += 1;
    return '\\';
  }
  if (next === '\n') {
    cursor.index += 2;
    return '';
  }
  if (next === '\r') {
    cursor.index += source[cursor.index + 2] === '\n' ? 3 : 2;
    return '';
  }
  const simple = SIMPLE_ESCAPES[next];
  if (simple !== undefined) {
    cursor.index += 2;
    return simple;
  }
  if (next === 'x' && /^[0-9a-fA-F]{2}/.test(source.slice(cursor.index + 2, cursor.index + 4))) {
    const hex = source.slice(cursor.index + 2, cursor.index + 4);
    cursor.index += 4;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }
  if (next === 'u' && source[cursor.index + 2] === '{') {
    const end = source.indexOf('}', cursor.index + 3);
    if (end !== -1) {
      const hex = source.slice(cursor.index + 3, end);
      cursor.index = end + 1;
      const codePoint = Number.parseInt(hex, 16);
      if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
        return String.fromCodePoint(codePoint);
      }
      return '';
    }
  }
  if (next === 'u' && /^[0-9a-fA-F]{4}/.test(source.slice(cursor.index + 2, cursor.index + 6))) {
    const hex = source.slice(cursor.index + 2, cursor.index + 6);
    cursor.index += 6;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }
  cursor.index += 2;
  return next;
};

const readQuoted = (source: string, cursor: ScanCursor, quote: string): string => {
  cursor.index += 1;
  let value = '';
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (char === undefined) {
      break;
    }
    if (char === '\\') {
      value += decodeEscape(source, cursor);
      continue;
    }
    if (char === quote || (char === '\n' && quote !== '`')) {
      if (char === quote) {
        cursor.index += 1;
      }
      return value;
    }
    value += char;
    cursor.index += 1;
  }
  return value;
};

const skipRegex = (source: string, cursor: ScanCursor): void => {
  cursor.index += 1;
  let inClass = false;
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (char === undefined || char === '\n') {
      return;
    }
    if (char === '\\') {
      cursor.index += 2;
      continue;
    }
    if (char === '[' && !inClass) {
      inClass = true;
      cursor.index += 1;
      continue;
    }
    if (char === ']' && inClass) {
      inClass = false;
      cursor.index += 1;
      continue;
    }
    if (char === '/' && !inClass) {
      cursor.index += 1;
      while (cursor.index < source.length && /[a-z]/i.test(source[cursor.index] ?? '')) {
        cursor.index += 1;
      }
      return;
    }
    cursor.index += 1;
  }
};

const scanCode = (
  source: string,
  cursor: ScanCursor,
  literals: string[],
  stopAtTemplateBrace: boolean
): void => {
  let braceDepth = 0;
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (char === undefined) {
      return;
    }
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || char === '\v') {
      cursor.index += 1;
      continue;
    }
    if (char === '/' && source[cursor.index + 1] === '/') {
      dropMigrationField(cursor);
      cursor.index += 2;
      while (cursor.index < source.length && source[cursor.index] !== '\n') {
        cursor.index += 1;
      }
      continue;
    }
    if (char === '/' && source[cursor.index + 1] === '*') {
      dropMigrationField(cursor);
      cursor.index += 2;
      while (
        cursor.index + 1 < source.length &&
        !(source[cursor.index] === '*' && source[cursor.index + 1] === '/')
      ) {
        cursor.index += 1;
      }
      cursor.index = Math.min(source.length, cursor.index + 2);
      continue;
    }
    if (char === "'" || char === '"') {
      const value = readQuoted(source, cursor, char);
      literals.push(value);
      if (cursor.fields !== undefined && cursor.awaitingValue === true && cursor.property !== undefined) {
        cursor.fields[cursor.property] = value;
      }
      dropMigrationField(cursor);
      cursor.slashIsRegex = false;
      continue;
    }
    if (char === '`') {
      dropMigrationField(cursor);
      readTemplate(source, cursor, literals);
      cursor.slashIsRegex = false;
      continue;
    }
    if (char === '/' && cursor.slashIsRegex) {
      dropMigrationField(cursor);
      skipRegex(source, cursor);
      cursor.slashIsRegex = false;
      continue;
    }
    if (isIdentStart(char)) {
      const start = cursor.index;
      cursor.index += 1;
      while (cursor.index < source.length && isIdentPart(source[cursor.index] ?? '')) {
        cursor.index += 1;
      }
      const word = source.slice(start, cursor.index);
      if (cursor.fields !== undefined) {
        if (word === 'owner' || word === 'reason') {
          cursor.property = word;
          cursor.awaitingValue = false;
        } else {
          dropMigrationField(cursor);
        }
      }
      cursor.slashIsRegex = REGEX_AFTER_WORD.has(word);
      continue;
    }
    if (isDigit(char) || (char === '.' && isDigit(source[cursor.index + 1]))) {
      dropMigrationField(cursor);
      cursor.index += 1;
      while (cursor.index < source.length && /[0-9a-zA-Z._]/.test(source[cursor.index] ?? '')) {
        cursor.index += 1;
      }
      cursor.slashIsRegex = false;
      continue;
    }
    if (char === '{') {
      dropMigrationField(cursor);
      braceDepth += 1;
      cursor.index += 1;
      cursor.slashIsRegex = true;
      continue;
    }
    if (char === '}') {
      dropMigrationField(cursor);
      if (stopAtTemplateBrace && braceDepth === 0) {
        cursor.index += 1;
        return;
      }
      braceDepth = Math.max(0, braceDepth - 1);
      cursor.index += 1;
      cursor.slashIsRegex = false;
      continue;
    }
    if (
      cursor.fields !== undefined &&
      char === ':' &&
      cursor.property !== undefined &&
      cursor.awaitingValue !== true
    ) {
      cursor.awaitingValue = true;
      cursor.index += 1;
      cursor.slashIsRegex = true;
      continue;
    }
    dropMigrationField(cursor);
    cursor.index += 1;
    cursor.slashIsRegex = REGEX_AFTER_PUNCT.has(char);
  }
};

const readTemplate = (source: string, cursor: ScanCursor, literals: string[]): void => {
  cursor.index += 1;
  let current = '';
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (char === undefined) {
      break;
    }
    if (char === '\\') {
      current += decodeEscape(source, cursor);
      continue;
    }
    if (char === '`') {
      literals.push(current);
      cursor.index += 1;
      return;
    }
    if (char === '$' && source[cursor.index + 1] === '{') {
      literals.push(current);
      current = '';
      cursor.index += 2;
      cursor.slashIsRegex = true;
      scanCode(source, cursor, literals, true);
      continue;
    }
    current += char;
    cursor.index += 1;
  }
  literals.push(current);
};

export const stringLiteralsInTypescript = (source: string): string[] => {
  const literals: string[] = [];
  scanCode(source, { index: 0, slashIsRegex: true }, literals, false);
  return literals;
};

/** `owner` and `reason` property strings. Not a TypeScript parser. */
export const readMigrationFields = (
  source: string
): { owner?: string; reason?: string } => {
  const fields: { owner?: string; reason?: string } = {};
  scanCode(source, { index: 0, slashIsRegex: true, fields }, [], false);
  return fields;
};
