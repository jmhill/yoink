import type { Database } from '../../database/types.js';
import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { ListStore } from '../domain/list-store.js';
import { storageError, type StorageError } from '../domain/list-errors.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { namedListDirection } from '../../listing/domain/list-keys.js';
import { parseListRow } from './parse-list-row.js';

const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='lists'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'ListStore requires "lists" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteListStore = async (db: Database): Promise<ListStore> => {
  await validateSchema(db);

  return {
    findById: (id: string): ResultAsync<NamedList | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
              SELECT id, organization_id, created_by_id, name, created_at
              FROM lists
              WHERE id = ?
            `,
          args: [id],
        }),
        (cause) => storageError('Failed to find named list', cause)
      ).andThen((result) => {
        const row = result.rows[0];
        if (!row) {
          return okAsync(null);
        }
        const parsed = parseListRow(row);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    findByIds: (ids: readonly string[]): ResultAsync<NamedList[], StorageError> => {
      if (ids.length === 0) {
        return okAsync([]);
      }
      const placeholders = ids.map(() => '?').join(', ');
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
              SELECT id, organization_id, created_by_id, name, created_at
              FROM lists
              WHERE id IN (${placeholders})
            `,
          args: [...ids],
        }),
        (cause) => storageError('Failed to find named lists', cause)
      ).andThen((result) => {
        const parsed = Result.combine(result.rows.map(parseListRow));
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    findByOrganization: (
      organizationId: string
    ): ResultAsync<NamedList[], StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `
              SELECT id, organization_id, created_by_id, name, created_at
              FROM lists
              WHERE organization_id = ?
              ORDER BY name ASC, created_at ASC, id ASC
            `,
            args: [organizationId],
          })
          .then((result) => {
            const parsed = Result.combine(result.rows.map(parseListRow));
            if (parsed.isErr()) {
              throw parsed.error;
            }
            return parsed.value;
          }),
        (cause) => storageError('Failed to list named lists', cause)
      );
    },

    pageByOrganization: (options: {
      organizationId: string;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<NamedList>, StorageError> => {
      return pageSqlite({
        db,
        from: 'lists',
        whereSql: 'organization_id = ?',
        whereArgs: [options.organizationId],
        orderSql: 'ORDER BY name ASC, created_at ASC, id ASC',
        keyColumns: ['name', 'created_at', 'id'],
        direction: namedListDirection,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
        mapRow: (row) => {
          const parsed = parseListRow(row);
          if (parsed.isErr()) {
            throw parsed.error;
          }
          return parsed.value;
        },
        errorMessage: 'Failed to list named lists',
      });
    },
  };
};
