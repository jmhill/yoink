import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import {
  organizationStorageError,
  type OrganizationStorageError,
} from '../domain/auth-errors.js';

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

const rowToOrganization = (row: OrganizationRow): Organization => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'OrganizationStore requires "organizations" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteOrganizationStore = async (
  db: Database
): Promise<OrganizationStore> => {
  await validateSchema(db);

  return {
    save: (organization: Organization): ResultAsync<void, OrganizationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO organizations (id, name, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
          `,
          args: [organization.id, organization.name, organization.createdAt],
        }),
        (error) => organizationStorageError('Failed to save organization', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<Organization | null, OrganizationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM organizations WHERE id = ?`,
          args: [id],
        }),
        (error) => organizationStorageError('Failed to find organization', error)
      ).map((result) => {
        const row = result.rows[0] as OrganizationRow | undefined;
        return row ? rowToOrganization(row) : null;
      });
    },

    findAll: (): ResultAsync<Organization[], OrganizationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM organizations ORDER BY created_at DESC`,
        }),
        (error) => organizationStorageError('Failed to find all organizations', error)
      ).map((result) => {
        const rows = result.rows as OrganizationRow[];
        return rows.map(rowToOrganization);
      });
    },
  };
};
