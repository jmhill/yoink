import { DatabaseSync } from 'node:sqlite';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';

export type SqliteUserStoreOptions = {
  location: string;
};

type UserRow = {
  id: string;
  organization_id: string;
  email: string;
  created_at: string;
};

const rowToUser = (row: UserRow): User => ({
  id: row.id,
  organizationId: row.organization_id,
  email: row.email,
  createdAt: row.created_at,
});

const initialize = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_organization
    ON users(organization_id)
  `);
};

export const createSqliteUserStore = (
  options: SqliteUserStoreOptions
): UserStore => {
  const db = new DatabaseSync(options.location);
  initialize(db);

  return {
    save: async (user: User): Promise<void> => {
      const stmt = db.prepare(`
        INSERT INTO users (id, organization_id, email, created_at)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(user.id, user.organizationId, user.email, user.createdAt);
    },

    findById: async (id: string): Promise<User | null> => {
      const stmt = db.prepare(`
        SELECT * FROM users WHERE id = ?
      `);

      const row = stmt.get(id) as UserRow | undefined;
      return row ? rowToUser(row) : null;
    },
  };
};
