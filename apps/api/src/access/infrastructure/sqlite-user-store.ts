import type { Database } from '../../database/types.js';
import { ResultAsync, okAsync } from 'neverthrow';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';
import { userStorageError, type UserStorageError } from '../domain/user-errors.js';

type UserRow = {
  id: string;
  email: string;
  created_at: string;
};

const rowToUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  createdAt: row.created_at,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'UserStore requires "users" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteUserStore = async (db: Database): Promise<UserStore> => {
  await validateSchema(db);

  return {
    save: (user: User): ResultAsync<void, UserStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO users (id, email, created_at)
            VALUES (?, ?, ?)
          `,
          args: [user.id, user.email, user.createdAt],
        }),
        (error) => userStorageError('Failed to save user', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<User | null, UserStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM users WHERE id = ?`,
          args: [id],
        }),
        (error) => userStorageError('Failed to find user', error)
      ).map((result) => {
        const row = result.rows[0] as UserRow | undefined;
        return row ? rowToUser(row) : null;
      });
    },

    findByEmail: (email: string): ResultAsync<User | null, UserStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM users WHERE email = ?`,
          args: [email],
        }),
        (error) => userStorageError('Failed to find user by email', error)
      ).map((result) => {
        const row = result.rows[0] as UserRow | undefined;
        return row ? rowToUser(row) : null;
      });
    },

    findByIds: (ids: string[]): ResultAsync<User[], UserStorageError> => {
      if (ids.length === 0) {
        return okAsync([]);
      }

      const placeholders = ids.map(() => '?').join(', ');
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM users WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
          args: ids,
        }),
        (error) => userStorageError('Failed to find users by ids', error)
      ).map((result) => {
        const rows = result.rows as UserRow[];
        return rows.map(rowToUser);
      });
    },
  };
};
