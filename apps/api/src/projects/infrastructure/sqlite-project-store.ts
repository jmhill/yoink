import type { Database } from '../../database/types.js';
import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { ProjectStore } from '../domain/project-store.js';
import { storageError, type StorageError } from '../domain/project-errors.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { projectDirection } from '../../listing/domain/list-keys.js';
import { parseProjectRow } from './parse-project-row.js';

const PROJECT_COLUMNS = `
  id, organization_id, created_by_id, name, objective, status,
  created_at, last_changed_at, last_changed_by
`;

const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'ProjectStore requires "projects" table. Ensure migrations have been run before starting the application.'
    );
  }
};

const parseRows = (rows: Record<string, unknown>[]): Result<Project[], StorageError> =>
  Result.combine(rows.map(parseProjectRow));

export const createSqliteProjectStore = async (db: Database): Promise<ProjectStore> => {
  await validateSchema(db);

  return {
    findById: (id: string): ResultAsync<Project | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`,
          args: [id],
        }),
        (cause) => storageError('Failed to find project', cause)
      ).andThen((result) => {
        const row = result.rows[0];
        if (!row) {
          return okAsync(null);
        }
        const parsed = parseProjectRow(row);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    findByOrganization: (
      organizationId: string
    ): ResultAsync<Project[], StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT ${PROJECT_COLUMNS}
            FROM projects
            WHERE organization_id = ?
            ORDER BY name ASC, created_at ASC, id ASC
          `,
          args: [organizationId],
        }),
        (cause) => storageError('Failed to list projects', cause)
      ).andThen((result) => {
        const parsed = parseRows(result.rows);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    pageByOrganization: (options: {
      organizationId: string;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<Project>, StorageError> => {
      return pageSqlite({
        db,
        from: 'projects',
        whereSql: 'organization_id = ?',
        whereArgs: [options.organizationId],
        orderSql: 'ORDER BY name ASC, created_at ASC, id ASC',
        keyColumns: ['name', 'created_at', 'id'],
        direction: projectDirection,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
        mapRow: (row) => row,
        errorMessage: 'Failed to list projects',
      }).andThen((page) => {
        const parsed = parseRows(page.rows);
        return parsed.isOk()
          ? okAsync({ rows: parsed.value, total: page.total })
          : errAsync(parsed.error);
      });
    },
  };
};
