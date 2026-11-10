import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { PasskeyCredential } from '../../domain/passkey-credential.js';
import type { PasskeyPlan } from '../../domain/passkey-plan.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same insert the credential store save uses. A duplicate id throws and
 * the batch is Storage. It is not signup's conditional insert, and it is
 * not a guard.
 */
const credentialInsert = (credential: PasskeyCredential): GuardedStatement =>
  statement(
    'insert',
    `
      INSERT INTO passkey_credentials (
        id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
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
    false
  );

/**
 * Passkey writes this service owns. None of the statements are guards.
 * Record-use is the store's counter update and then its last-used update,
 * in one batch. Delete is the store's delete.
 */
export const compilePasskeyPlan = (plan: PasskeyPlan): readonly GuardedStatement[] => {
  switch (plan.kind) {
    case 'save-passkey':
      return [credentialInsert(plan.credential)];
    case 'record-passkey-use':
      return [
        statement(
          'update',
          `UPDATE passkey_credentials SET counter = ? WHERE id = ?`,
          [plan.counter, plan.credentialId],
          false
        ),
        statement(
          'update',
          `UPDATE passkey_credentials SET last_used_at = ? WHERE id = ?`,
          [plan.lastUsedAt, plan.credentialId],
          false
        ),
      ];
    case 'delete-passkey':
      return [
        statement(
          'delete',
          `DELETE FROM passkey_credentials WHERE id = ?`,
          [plan.credentialId],
          false
        ),
      ];
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};
