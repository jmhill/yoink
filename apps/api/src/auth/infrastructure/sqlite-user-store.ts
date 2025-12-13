import type { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';
import { userStorageError, type UserStorageError } from '../domain/auth-errors.js';

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

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = (db: DatabaseSync): void => {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .get();

  if (!table) {
    throw new Error(
      'UserStore requires "users" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteUserStore = (db: DatabaseSync): UserStore => {
  validateSchema(db);

  return {
    save: (user: User): ResultAsync<void, UserStorageError> => {
      try {
        const stmt = db.prepare(`
          INSERT INTO users (id, organization_id, email, created_at)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run(user.id, user.organizationId, user.email, user.createdAt);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(userStorageError('Failed to save user', error));
      }
    },

    findById: (id: string): ResultAsync<User | null, UserStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM users WHERE id = ?
        `);

        const row = stmt.get(id) as UserRow | undefined;
        return okAsync(row ? rowToUser(row) : null);
      } catch (error) {
        return errAsync(userStorageError('Failed to find user', error));
      }
    },

    findByOrganizationId: (organizationId: string): ResultAsync<User[], UserStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM users WHERE organization_id = ? ORDER BY created_at DESC
        `);

        const rows = stmt.all(organizationId) as UserRow[];
        return okAsync(rows.map(rowToUser));
      } catch (error) {
        return errAsync(userStorageError('Failed to find users by organization', error));
      }
    },
  };
};
