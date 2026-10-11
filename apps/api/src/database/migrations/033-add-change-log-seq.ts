import type { Migration } from '../types.js';

/**
 * Project history (#138): a monotonic insertion sequence so records that
 * share occurred_at (a move, a done+clear, marking the project done) stay
 * in write order. Production ids are random UUIDs; rowid can change on
 * VACUUM for a TEXT-PK table. Backfill from rowid, then index the
 * visible project timeline keyset [occurred_at, seq].
 */
export const migration: Migration = {
  version: 33,
  name: 'add_change_log_seq',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `ALTER TABLE change_log ADD COLUMN seq INTEGER NOT NULL DEFAULT 0`,
        },
        {
          sql: `UPDATE change_log SET seq = rowid`,
        },
        {
          sql: `
            CREATE INDEX idx_change_log_org_project_visible
            ON change_log (organization_id, project_id, hidden, occurred_at, seq)
          `,
        },
      ],
      'write'
    );
  },
};
