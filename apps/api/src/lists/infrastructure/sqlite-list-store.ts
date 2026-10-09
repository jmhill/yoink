import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { ListStore } from '../domain/list-store.js';
import { storageError, type StorageError } from '../domain/list-errors.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { namedListDirection } from '../../listing/domain/list-keys.js';

type ListRow = {
  id: string;
  organization_id: string;
  created_by_id: string;
  name: string;
  created_at: string;
};

const rowToNamedList = (row: ListRow): NamedList => ({
  id: row.id,
  organizationId: row.organization_id,
  createdById: row.created_by_id,
  name: row.name,
  createdAt: row.created_at,
});

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
    save: (list: NamedList): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `
              INSERT INTO lists (
                id, organization_id, created_by_id, name, created_at
              ) VALUES (?, ?, ?, ?, ?)
            `,
            args: [
              list.id,
              list.organizationId,
              list.createdById,
              list.name,
              list.createdAt,
            ],
          })
          .then(() => undefined),
        (cause) => storageError('Failed to save named list', cause)
      );
    },

    update: (list: NamedList): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `
              UPDATE lists
              SET name = ?
              WHERE id = ?
            `,
            args: [list.name, list.id],
          })
          .then(() => undefined),
        (cause) => storageError('Failed to rename named list', cause)
      );
    },

    findById: (id: string): ResultAsync<NamedList | null, StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `
              SELECT id, organization_id, created_by_id, name, created_at
              FROM lists
              WHERE id = ?
            `,
            args: [id],
          })
          .then((result) => {
            const row = result.rows[0] as ListRow | undefined;
            return row ? rowToNamedList(row) : null;
          }),
        (cause) => storageError('Failed to find named list', cause)
      );
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
          .then((result) => result.rows.map((row) => rowToNamedList(row as ListRow))),
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
        mapRow: (row) => rowToNamedList(row as ListRow),
        errorMessage: 'Failed to list named lists',
      });
    },

    remove: (id: string): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `DELETE FROM lists WHERE id = ?`,
            args: [id],
          })
          .then(() => undefined),
        (cause) => storageError('Failed to delete named list', cause)
      );
    },
  };
};
