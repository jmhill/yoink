import { ResultAsync } from 'neverthrow';
import type { Database } from '../../../platform/database/types.js';

export type ProjectChange = {
  readonly projectId: string;
  readonly occurredAt: string;
};

export type ProjectChangeError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const createSqliteProjectChanges =
  (db: Database) =>
  (organizationId: string): ResultAsync<readonly ProjectChange[], ProjectChangeError> =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT project_id, MAX(occurred_at) AS occurred_at
          FROM change_log
          WHERE organization_id = ?
            AND project_id IS NOT NULL
          GROUP BY project_id
        `,
        args: [organizationId],
      }),
      (cause) => ({
        type: 'STORAGE_ERROR' as const,
        message: 'Failed to load project changes',
        cause,
      })
    ).map((result) =>
      result.rows.flatMap((row) => {
        const projectId = row.project_id;
        const occurredAt = row.occurred_at;
        if (typeof projectId !== 'string' || typeof occurredAt !== 'string') {
          return [];
        }
        return [{ projectId, occurredAt }];
      })
    );
