import type { DatabaseSync } from 'node:sqlite';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';

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
    save: async (organization: Organization): Promise<void> => {
      const stmt = db.prepare(`
        INSERT INTO organizations (id, name, created_at)
        VALUES (?, ?, ?)
      `);

      stmt.run(organization.id, organization.name, organization.createdAt);
    },

    findById: async (id: string): Promise<Organization | null> => {
      const stmt = db.prepare(`
        SELECT * FROM organizations WHERE id = ?
      `);

      const row = stmt.get(id) as OrganizationRow | undefined;
      return row ? rowToOrganization(row) : null;
    },
  };
};
