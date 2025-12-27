import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { PasskeyCredential, PasskeyTransport } from '../domain/passkey-credential.js';
import type { PasskeyCredentialStore } from '../domain/passkey-credential-store.js';
import {
  passkeyCredentialStorageError,
  type PasskeyCredentialStorageError,
} from '../domain/auth-errors.js';

type PasskeyCredentialRow = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: number; // SQLite stores booleans as 0/1
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

const rowToCredential = (row: PasskeyCredentialRow): PasskeyCredential => ({
  id: row.id,
  userId: row.user_id,
  publicKey: row.public_key,
  counter: row.counter,
  transports: row.transports ? (JSON.parse(row.transports) as PasskeyTransport[]) : undefined,
  deviceType: row.device_type,
  backedUp: row.backed_up === 1,
  name: row.name ?? undefined,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at ?? undefined,
});

/**
 * Validates that the required database schema exists.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='passkey_credentials'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'PasskeyCredentialStore requires "passkey_credentials" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqlitePasskeyCredentialStore = async (
  db: Database
): Promise<PasskeyCredentialStore> => {
  await validateSchema(db);

  return {
    save: (credential: PasskeyCredential): ResultAsync<void, PasskeyCredentialStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO passkey_credentials (
              id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            credential.id,
            credential.userId,
            credential.publicKey,
            credential.counter,
            credential.transports ? JSON.stringify(credential.transports) : null,
            credential.deviceType,
            credential.backedUp ? 1 : 0,
            credential.name ?? null,
            credential.createdAt,
            credential.lastUsedAt ?? null,
          ],
        }),
        (error) => passkeyCredentialStorageError('Failed to save passkey credential', error)
      ).map(() => undefined);
    },

    findById: (credentialId: string): ResultAsync<PasskeyCredential | null, PasskeyCredentialStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM passkey_credentials WHERE id = ?`,
          args: [credentialId],
        }),
        (error) => passkeyCredentialStorageError('Failed to find passkey credential', error)
      ).map((result) => {
        const row = result.rows[0] as PasskeyCredentialRow | undefined;
        return row ? rowToCredential(row) : null;
      });
    },

    findByUserId: (userId: string): ResultAsync<PasskeyCredential[], PasskeyCredentialStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC`,
          args: [userId],
        }),
        (error) => passkeyCredentialStorageError('Failed to find passkey credentials by user', error)
      ).map((result) => {
        const rows = result.rows as PasskeyCredentialRow[];
        return rows.map(rowToCredential);
      });
    },

    updateCounter: (
      credentialId: string,
      newCounter: number
    ): ResultAsync<void, PasskeyCredentialStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `UPDATE passkey_credentials SET counter = ? WHERE id = ?`,
          args: [newCounter, credentialId],
        }),
        (error) => passkeyCredentialStorageError('Failed to update passkey credential counter', error)
      ).map(() => undefined);
    },

    updateLastUsed: (
      credentialId: string,
      timestamp: string
    ): ResultAsync<void, PasskeyCredentialStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `UPDATE passkey_credentials SET last_used_at = ? WHERE id = ?`,
          args: [timestamp, credentialId],
        }),
        (error) => passkeyCredentialStorageError('Failed to update passkey credential last used', error)
      ).map(() => undefined);
    },

    delete: (credentialId: string): ResultAsync<void, PasskeyCredentialStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM passkey_credentials WHERE id = ?`,
          args: [credentialId],
        }),
        (error) => passkeyCredentialStorageError('Failed to delete passkey credential', error)
      ).map(() => undefined);
    },
  };
};
