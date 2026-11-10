import type { TableOwnershipAllowlistEntry } from './table-ownership.js';

/**
 * Today's cross-owner SQL. Each entry matches one (file, keyword, table)
 * count from the M1.2 scanner. A new hit is not covered. A hit that goes
 * away makes its entry stale. Do not add an entry to hide a scanner miss.
 *
 * `edges/test-fixtures/` is exempt. The ownerless fixture has no
 * keyword-led table reference. The review fixture's SQL is exempt with
 * that directory. M7.4 retires both files.
 *
 * M5.5 removed the processing statements and task-management's capture
 * soft-delete. Processing is a workflow and writes through each module.
 * M5.7 moved notes' user, membership, and project lookups onto ports.
 * History writes the note timeline from the integration event.
 */
export const TABLE_OWNERSHIP_ALLOWLIST = [
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

  // M5.8c moves organizations.notes_mirror_bot_user_id onto notes_settings.
  // M5.8
  {
    path: 'modules/notes/infrastructure/persistence/load-notes-mirror-bot.ts',
    keyword: 'FROM',
    table: 'organizations',
    count: 1,
    removedBy: 'M5.8',
  },
  // M5.8
  {
    path: 'modules/notes/infrastructure/persistence/load-notes-mirror-bot.ts',
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

] as const satisfies readonly TableOwnershipAllowlistEntry[];
