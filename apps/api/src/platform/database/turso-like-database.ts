import type { Database, QueryResult } from './types.js';

const ignoredPragma: QueryResult = { rows: [], rowsAffected: 0 };

/**
 * Turso HTTP opens a new stream per request. A standalone
 * `PRAGMA foreign_keys = OFF` does not apply to the next `batch`, and that
 * batch begins with foreign keys on. `migrate` is one stream: foreign keys
 * off before `BEGIN`, then the statements, then foreign keys on.
 *
 * Migration tests use this by default so a rebuild that still does the old
 * pragma-then-batch path fails here the way it fails on Turso.
 */
export const tursoLikeDatabase = (inner: Database): Database => ({
  execute: (query) => {
    if (/PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(query.sql)) {
      return Promise.resolve(ignoredPragma);
    }
    return inner.execute(query);
  },
  batch: async (queries, mode) => {
    await inner.execute({ sql: 'PRAGMA foreign_keys = ON' });
    return inner.batch(queries, mode);
  },
  migrate: (queries) => {
    const migrate = inner.migrate;
    if (migrate === undefined) {
      throw new Error('tursoLikeDatabase requires Database.migrate');
    }
    return migrate(queries);
  },
  close: () => inner.close(),
});
