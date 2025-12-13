import { DatabaseSync } from 'node:sqlite';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';

export type SqliteOrganizationStoreOptions = {
  location: string;
};

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

const initialize = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
};

export const createSqliteOrganizationStore = (
  options: SqliteOrganizationStoreOptions
): OrganizationStore => {
  const db = new DatabaseSync(options.location);
  initialize(db);

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
