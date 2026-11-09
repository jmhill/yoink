import { ResultAsync } from 'neverthrow';
import type { Database } from '../../platform/database/types.js';
import type { AccessStorageError } from '../application/access-types.js';

export const createSqliteOrganizationTimeZone =
  (db: Database) =>
  (organizationId: string): ResultAsync<string | null, AccessStorageError> =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT time_zone FROM organizations WHERE id = ?`,
        args: [organizationId],
      }),
      () => ({
        type: 'ACCESS_STORAGE' as const,
        message: 'Failed to read organization time zone',
      })
    ).map((result) => {
      const zone = result.rows[0]?.time_zone;
      return typeof zone === 'string' ? zone : null;
    });
