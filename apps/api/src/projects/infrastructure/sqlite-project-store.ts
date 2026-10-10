import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { Project, ProjectStatus } from '@yoink/api-contracts';
import type { ProjectStore } from '../domain/project-store.js';
import { storageError, type StorageError } from '../domain/project-errors.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { projectDirection } from '../../listing/domain/list-keys.js';

type ProjectRow = {
  id: string;
  organization_id: string;
  created_by_id: string;
  name: string;
  objective: string | null;
  status: string;
  created_at: string;
  last_changed_at: string | null;
  last_changed_by: string | null;
};

const STATUSES: readonly ProjectStatus[] = [
  'active',
  'waiting',
  'someday',
  'done',
  'proposed',
];

const isProjectStatus = (value: string): value is ProjectStatus =>
  STATUSES.some((status) => status === value);

const rowToProject = (row: ProjectRow): Project | null => {
  if (!isProjectStatus(row.status)) {
    return null;
  }

  const project: Project = {
    id: row.id,
    organizationId: row.organization_id,
    createdById: row.created_by_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    lastChangedAt: row.last_changed_at,
    lastChangedBy: row.last_changed_by,
  };

  if (row.objective) {
    project.objective = row.objective;
  }

  return project;
};

const mapRow = (row: Record<string, unknown>): Project => {
  const mapped = rowToProject(row as ProjectRow);
  if (!mapped) {
    return {
      id: String(row.id ?? ''),
      organizationId: String(row.organization_id ?? ''),
      createdById: String(row.created_by_id ?? ''),
      name: String(row.name ?? ''),
      status: 'active',
      createdAt: String(row.created_at ?? ''),
      lastChangedAt: null,
      lastChangedBy: null,
    };
  }
  return mapped;
};

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

export const createSqliteProjectStore = async (db: Database): Promise<ProjectStore> => {
  await validateSchema(db);

  return {
    findById: (id: string): ResultAsync<Project | null, StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `
              SELECT id, organization_id, created_by_id, name, objective, status,
                     created_at, last_changed_at, last_changed_by
              FROM projects
              WHERE id = ?
            `,
            args: [id],
          })
          .then((result) => {
            const row = result.rows[0] as ProjectRow | undefined;
            return row ? rowToProject(row) : null;
          }),
        (cause) => storageError('Failed to find project', cause)
      );
    },

    findByOrganization: (
      organizationId: string
    ): ResultAsync<Project[], StorageError> => {
      return ResultAsync.fromPromise(
        db
          .execute({
            sql: `
              SELECT id, organization_id, created_by_id, name, objective, status,
                     created_at, last_changed_at, last_changed_by
              FROM projects
              WHERE organization_id = ?
              ORDER BY name ASC, created_at ASC, id ASC
            `,
            args: [organizationId],
          })
          .then((result) =>
            result.rows.flatMap((row) => {
              const project = rowToProject(row as ProjectRow);
              return project ? [project] : [];
            })
          ),
        (cause) => storageError('Failed to list projects', cause)
      );
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
        mapRow,
        errorMessage: 'Failed to list projects',
      });
    },
  };
};
