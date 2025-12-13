import type { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
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
const validateSchema = (db: DatabaseSync): void => {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'`
    )
    .get();

  if (!table) {
    throw new Error(
      'OrganizationStore requires "organizations" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteOrganizationStore = (
  db: DatabaseSync
): OrganizationStore => {
  validateSchema(db);

  return {
    save: (organization: Organization): ResultAsync<void, OrganizationStorageError> => {
      try {
        const stmt = db.prepare(`
          INSERT INTO organizations (id, name, created_at)
          VALUES (?, ?, ?)
        `);

        stmt.run(organization.id, organization.name, organization.createdAt);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(organizationStorageError('Failed to save organization', error));
      }
    },

    findById: (id: string): ResultAsync<Organization | null, OrganizationStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM organizations WHERE id = ?
        `);

        const row = stmt.get(id) as OrganizationRow | undefined;
        return okAsync(row ? rowToOrganization(row) : null);
      } catch (error) {
        return errAsync(organizationStorageError('Failed to find organization', error));
      }
    },

    findAll: (): ResultAsync<Organization[], OrganizationStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM organizations ORDER BY created_at DESC
        `);

        const rows = stmt.all() as OrganizationRow[];
        return okAsync(rows.map(rowToOrganization));
      } catch (error) {
        return errAsync(organizationStorageError('Failed to find all organizations', error));
      }
    },
  };
};
