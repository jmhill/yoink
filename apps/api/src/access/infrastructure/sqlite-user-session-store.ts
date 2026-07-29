import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { UserSession } from '../domain/user-session.js';
import type { UserSessionStore } from '../domain/user-session-store.js';
import {
  sessionStorageError,
  type SessionStorageError,
} from '../domain/auth-errors.js';

type UserSessionRow = {
  id: string;
  user_id: string;
  current_organization_id: string;
  created_at: string;
  expires_at: string;
  last_active_at: string;
};

const rowToSession = (row: UserSessionRow): UserSession => ({
  id: row.id,
  userId: row.user_id,
  currentOrganizationId: row.current_organization_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastActiveAt: row.last_active_at,
});

/**
 * Validates that the required database schema exists.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'UserSessionStore requires "user_sessions" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteUserSessionStore = async (
  db: Database
): Promise<UserSessionStore> => {
  await validateSchema(db);

  return {
    save: (session: UserSession): ResultAsync<void, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO user_sessions (
              id, user_id, current_organization_id, created_at, expires_at, last_active_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          args: [
            session.id,
            session.userId,
            session.currentOrganizationId,
            session.createdAt,
            session.expiresAt,
            session.lastActiveAt,
          ],
        }),
        (error) => sessionStorageError('Failed to save user session', error)
      ).map(() => undefined);
    },

    findById: (sessionId: string): ResultAsync<UserSession | null, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM user_sessions WHERE id = ?`,
          args: [sessionId],
        }),
        (error) => sessionStorageError('Failed to find user session', error)
      ).map((result) => {
        const row = result.rows[0] as UserSessionRow | undefined;
        return row ? rowToSession(row) : null;
      });
    },

    findByUserId: (userId: string): ResultAsync<UserSession[], SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC`,
          args: [userId],
        }),
        (error) => sessionStorageError('Failed to find user sessions by user', error)
      ).map((result) => {
        const rows = result.rows as UserSessionRow[];
        return rows.map(rowToSession);
      });
    },

    updateLastActive: (
      sessionId: string,
      timestamp: string
    ): ResultAsync<void, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `UPDATE user_sessions SET last_active_at = ? WHERE id = ?`,
          args: [timestamp, sessionId],
        }),
        (error) => sessionStorageError('Failed to update session last active', error)
      ).map(() => undefined);
    },

    updateCurrentOrganization: (
      sessionId: string,
      organizationId: string
    ): ResultAsync<void, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `UPDATE user_sessions SET current_organization_id = ? WHERE id = ?`,
          args: [organizationId, sessionId],
        }),
        (error) => sessionStorageError('Failed to update session organization', error)
      ).map(() => undefined);
    },

    delete: (sessionId: string): ResultAsync<void, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM user_sessions WHERE id = ?`,
          args: [sessionId],
        }),
        (error) => sessionStorageError('Failed to delete user session', error)
      ).map(() => undefined);
    },

    deleteByUserId: (userId: string): ResultAsync<void, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM user_sessions WHERE user_id = ?`,
          args: [userId],
        }),
        (error) => sessionStorageError('Failed to delete user sessions by user', error)
      ).map(() => undefined);
    },

    deleteExpired: (now: string): ResultAsync<number, SessionStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM user_sessions WHERE expires_at < ?`,
          args: [now],
        }),
        (error) => sessionStorageError('Failed to delete expired sessions', error)
      ).map((result) => result.rowsAffected);
    },
  };
};
