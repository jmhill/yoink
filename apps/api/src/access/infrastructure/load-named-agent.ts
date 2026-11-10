import { okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../platform/database/types.js';

export type NamedAgentLookupError = {
  readonly message: string;
  readonly cause?: unknown;
};

/**
 * Earliest membership of an agent with this name. Access owns
 * organization_memberships and users. The caller passes the name.
 */
export const loadNamedAgentFromSqlite =
  (db: Database) =>
  (input: {
    organizationId: string;
    name: string;
  }): ResultAsync<string | null, NamedAgentLookupError> =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT u.id AS id
          FROM organization_memberships m
          JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = ?
            AND u.kind = 'agent'
            AND u.name = ?
          ORDER BY m.joined_at
          LIMIT 1
        `,
        args: [input.organizationId, input.name],
      }),
      (cause) => ({ message: 'Failed to resolve named agent', cause })
    ).andThen((found) => {
      const userId = found.rows[0]?.id;
      return okAsync(typeof userId === 'string' && userId.length > 0 ? userId : null);
    });
