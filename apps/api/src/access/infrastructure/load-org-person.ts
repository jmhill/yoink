import { okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../platform/database/types.js';

export type OrgPersonRow = {
  readonly userId: string;
  readonly name: string;
};

export type OrgPersonLookupError = {
  readonly message: string;
  readonly cause?: unknown;
};

/**
 * First human in the organization: owner, then admin, then everyone else,
 * then earliest join. Access owns organization_memberships and users.
 */
export const loadOrgPersonFromSqlite =
  (db: Database) =>
  (organizationId: string): ResultAsync<OrgPersonRow | null, OrgPersonLookupError> =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT u.id AS id, COALESCE(NULLIF(u.name, ''), u.email) AS name
          FROM organization_memberships m
          JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = ?
            AND u.kind = 'human'
          ORDER BY CASE m.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            ELSE 2
          END, m.joined_at
          LIMIT 1
        `,
        args: [organizationId],
      }),
      (cause) => ({ message: 'Failed to load organization person', cause })
    ).andThen((result) => {
      const row = result.rows[0];
      if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') {
        return okAsync(null);
      }
      return okAsync({ userId: row.id, name: row.name });
    });
