import type { TableOwnershipAllowlistEntry } from './table-ownership.js';

/**
 * Today's cross-owner SQL. Each entry matches one (file, keyword, table)
 * count from the M1.2 scanner. A new hit is not covered. A hit that goes
 * away makes its entry stale. Do not add an entry to hide a scanner miss.
 *
 * `access/infrastructure/http-ownerless-workspace-fixture-routes.ts` is a
 * fixture route (M3.4 moves it, M7.4 retires it) and currently has no
 * keyword-led table reference, so it has no entry. The review fixture
 * routes below do.
 */
export const TABLE_OWNERSHIP_ALLOWLIST = [
  // tasks, projects, lists, processing, and notes still import
  // insertChangeLogQuery from modules/history/infrastructure/sql.ts.
  // That SQL stays in that file, so the imports are not new rows.
  // The tasks that stop the calls: tasks, projects, and lists are M5.3;
  // processing is M5.5; notes is M5.7.
  // M4.4 deletes existsClause and the other cross-module guards in history SQL.
  // M4.4
  {
    path: 'modules/history/infrastructure/sql.ts',
    keyword: 'FROM',
    table: 'lists',
    count: 1,
    removedBy: 'M4.4',
  },
  // M4.4
  {
    path: 'modules/history/infrastructure/sql.ts',
    keyword: 'FROM',
    table: 'organizations',
    count: 1,
    removedBy: 'M4.4',
  },
  // M4.4
  {
    path: 'modules/history/infrastructure/sql.ts',
    keyword: 'FROM',
    table: 'project_notes',
    count: 1,
    removedBy: 'M4.4',
  },
  // M4.4
  {
    path: 'modules/history/infrastructure/sql.ts',
    keyword: 'FROM',
    table: 'projects',
    count: 1,
    removedBy: 'M4.4',
  },
  // M4.4 — existsClause for tasks, plus insertChangeLogQuery's requireTask guard.
  {
    path: 'modules/history/infrastructure/sql.ts',
    keyword: 'FROM',
    table: 'tasks',
    count: 2,
    removedBy: 'M4.4',
  },

  // M5.2 moves work's queries into task-management and deletes work/.
  // M5.2
  {
    path: 'work/infrastructure/sqlite-work-store.ts',
    keyword: 'FROM',
    table: 'lists',
    count: 1,
    removedBy: 'M5.2',
  },
  // M5.2
  {
    path: 'work/infrastructure/sqlite-work-store.ts',
    keyword: 'FROM',
    table: 'projects',
    count: 2,
    removedBy: 'M5.2',
  },
  // M5.2 — countUnlistedOpen. pageSqlite's bare from: 'tasks' is not keyword-led.
  {
    path: 'work/infrastructure/sqlite-work-store.ts',
    keyword: 'FROM',
    table: 'tasks',
    count: 1,
    removedBy: 'M5.2',
  },
  // M5.2
  {
    path: 'work/infrastructure/sqlite-work-store.ts',
    keyword: 'JOIN',
    table: 'tasks',
    count: 3,
    removedBy: 'M5.2',
  },

  // M5.3 stops task-management SQL from deleting history rows.
  // M5.3
  {
    path: 'projects/infrastructure/store-backed-persist.ts',
    keyword: 'FROM',
    table: 'change_log',
    count: 1,
    removedBy: 'M5.3',
  },

  // M5.5 deletes process-row-statements.ts and softDeleteCaptureQuery.
  // M5.5
  {
    path: 'processing/infrastructure/process-row-statements.ts',
    keyword: 'FROM',
    table: 'captures',
    count: 1,
    removedBy: 'M5.5',
  },
  // M5.5
  {
    path: 'processing/infrastructure/process-row-statements.ts',
    keyword: 'INTO',
    table: 'projects',
    count: 1,
    removedBy: 'M5.5',
  },
  // M5.5
  {
    path: 'processing/infrastructure/process-row-statements.ts',
    keyword: 'INTO',
    table: 'tasks',
    count: 1,
    removedBy: 'M5.5',
  },
  // M5.5
  {
    path: 'processing/infrastructure/process-row-statements.ts',
    keyword: 'UPDATE',
    table: 'captures',
    count: 1,
    removedBy: 'M5.5',
  },
  // M5.5 — softDeleteCaptureQuery.
  {
    path: 'tasks/infrastructure/task-row-statements.ts',
    keyword: 'UPDATE',
    table: 'captures',
    count: 1,
    removedBy: 'M5.5',
  },

  // M5.7 moves notes' user, membership, and project lookups onto consumer-owned ports.
  // M5.7
  {
    path: 'notes/infrastructure/load-notes-mirror-bot.ts',
    keyword: 'FROM',
    table: 'organization_memberships',
    count: 1,
    removedBy: 'M5.7',
  },
  // M5.7
  {
    path: 'notes/infrastructure/load-notes-mirror-bot.ts',
    keyword: 'JOIN',
    table: 'users',
    count: 1,
    removedBy: 'M5.7',
  },
  // M5.7 — load-org-person.ts is the same person lookup. The issue names the mirror-bot file; this one is the same removal.
  {
    path: 'notes/infrastructure/load-org-person.ts',
    keyword: 'FROM',
    table: 'organization_memberships',
    count: 1,
    removedBy: 'M5.7',
  },
  // M5.7
  {
    path: 'notes/infrastructure/load-org-person.ts',
    keyword: 'JOIN',
    table: 'users',
    count: 1,
    removedBy: 'M5.7',
  },
  // M5.7
  {
    path: 'notes/infrastructure/note-row-statements.ts',
    keyword: 'JOIN',
    table: 'projects',
    count: 1,
    removedBy: 'M5.7',
  },
  // M5.7
  {
    path: 'notes/infrastructure/note-row-statements.ts',
    keyword: 'JOIN',
    table: 'users',
    count: 4,
    removedBy: 'M5.7',
  },

  // M5.8 moves organizations.notes_mirror_bot_user_id onto notes_settings.
  // M5.8
  {
    path: 'notes/infrastructure/load-notes-mirror-bot.ts',
    keyword: 'FROM',
    table: 'organizations',
    count: 1,
    removedBy: 'M5.8',
  },
  // M5.8
  {
    path: 'notes/infrastructure/load-notes-mirror-bot.ts',
    keyword: 'UPDATE',
    table: 'organizations',
    count: 2,
    removedBy: 'M5.8',
  },

  // M5.10-history reads task, project, note, and user names through ports.
  // M5.10-history
  {
    path: 'modules/history/infrastructure/sqlite-history-lookups.ts',
    keyword: 'FROM',
    table: 'project_notes',
    count: 1,
    removedBy: 'M5.10-history',
  },
  // M5.10-history
  {
    path: 'modules/history/infrastructure/sqlite-history-lookups.ts',
    keyword: 'FROM',
    table: 'projects',
    count: 1,
    removedBy: 'M5.10-history',
  },
  // M5.10-history
  {
    path: 'modules/history/infrastructure/sqlite-history-lookups.ts',
    keyword: 'FROM',
    table: 'tasks',
    count: 1,
    removedBy: 'M5.10-history',
  },
  // M5.10-history
  {
    path: 'modules/history/infrastructure/sqlite-history-lookups.ts',
    keyword: 'FROM',
    table: 'users',
    count: 1,
    removedBy: 'M5.10-history',
  },

  // M5.10-review stops review SQL from reading task-management, history, and access tables.
  // M5.10-review
  {
    path: 'review/infrastructure/sqlite-review-store.ts',
    keyword: 'FROM',
    table: 'change_log',
    count: 1,
    removedBy: 'M5.10-review',
  },
  // M5.10-review — organization time zone, through an access port.
  {
    path: 'review/infrastructure/sqlite-review-store.ts',
    keyword: 'FROM',
    table: 'organizations',
    count: 1,
    removedBy: 'M5.10-review',
  },
  // M5.10-review
  {
    path: 'review/infrastructure/sqlite-review-store.ts',
    keyword: 'FROM',
    table: 'projects',
    count: 1,
    removedBy: 'M5.10-review',
  },
  // M5.10-review — OTHER_COUNT_SQL plus the DONE_FROM fragment that opens with `tasks t`.
  {
    path: 'review/infrastructure/sqlite-review-store.ts',
    keyword: 'FROM',
    table: 'tasks',
    count: 2,
    removedBy: 'M5.10-review',
  },
  // M5.10-review
  {
    path: 'review/infrastructure/sqlite-review-store.ts',
    keyword: 'JOIN',
    table: 'projects',
    count: 1,
    removedBy: 'M5.10-review',
  },
  // M5.10-review
  {
    path: 'review/infrastructure/sqlite-review-store.ts',
    keyword: 'JOIN',
    table: 'tasks',
    count: 2,
    removedBy: 'M5.10-review',
  },

  // M7.4 retires fixture routes. M3.4 moves this file to edges/test-fixtures/, which is exempt until then.
  // M7.4
  {
    path: 'review/infrastructure/http-review-fixture-routes.ts',
    keyword: 'UPDATE',
    table: 'change_log',
    count: 1,
    removedBy: 'M7.4',
  },
  // M7.4
  {
    path: 'review/infrastructure/http-review-fixture-routes.ts',
    keyword: 'UPDATE',
    table: 'projects',
    count: 1,
    removedBy: 'M7.4',
  },
  // M7.4
  {
    path: 'review/infrastructure/http-review-fixture-routes.ts',
    keyword: 'UPDATE',
    table: 'tasks',
    count: 1,
    removedBy: 'M7.4',
  },

  // M7.5 requires an empty allowlist. No earlier task rewrites these test helpers.
  // They are non-test .ts, so the scanner sees them. Moving the SQL into a *.test.ts file removes the hit.
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'api_tokens',
    count: 1,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'captures',
    count: 2,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'invitations',
    count: 2,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'organization_memberships',
    count: 3,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'organizations',
    count: 1,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'passkey_credentials',
    count: 1,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'tasks',
    count: 2,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'user_sessions',
    count: 1,
    removedBy: 'M7.5',
  },
  // M7.5
  {
    path: 'platform/database/migration-seeder.ts',
    keyword: 'INTO',
    table: 'users',
    count: 2,
    removedBy: 'M7.5',
  },
  // M7.5 — src/tests helper, not a *.test.ts file.
  {
    path: 'tests/helpers/test-app.ts',
    keyword: 'INTO',
    table: 'user_sessions',
    count: 1,
    removedBy: 'M7.5',
  },
] as const satisfies readonly TableOwnershipAllowlistEntry[];
