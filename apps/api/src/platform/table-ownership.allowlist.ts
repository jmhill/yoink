import type { TableOwnershipAllowlistEntry } from './table-ownership.js';

/**
 * Today's cross-owner SQL. Each entry matches one (file, keyword, table)
 * count from the M1.2 scanner. A new hit is not covered. A hit that goes
 * away makes its entry stale. Do not add an entry to hide a scanner miss.
 *
 * `edges/test-fixtures/` stays exempt. M7.4 records why. The ownerless
 * fixture has no keyword-led table reference. The review fixture's SQL
 * is exempt with that directory. The allowlist itself stays empty.
 *
 * M5.5 removed the processing statements and task-management's capture
 * soft-delete. Processing is a workflow and writes through each module.
 * M5.7 moved notes' user, membership, and project lookups onto ports.
 * History writes the note timeline from the integration event.
 * M4.4 removed existsClause. M5.10-history moved task, project, note, and
 * user name reads onto the modules that own those tables. M5.8c moved the
 * mirror-bot read and write onto `notes_settings`. The list is empty.
 */
export const TABLE_OWNERSHIP_ALLOWLIST: readonly TableOwnershipAllowlistEntry[] = [];
