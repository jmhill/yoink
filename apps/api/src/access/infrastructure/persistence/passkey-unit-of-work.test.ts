import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createPasskeyService } from '../../application/handle-passkey.js';
import { createChallengeManager } from '../../domain/challenge.js';
import { nodeChallengeCrypto } from '../node-challenge-crypto.js';
import { planDeletePasskey, planRecordPasskeyUse, planSavePasskey } from '../../domain/passkey-plan.js';
import type { PasskeyCredentialStore } from '../../domain/passkey-credential-store.js';
import type { User } from '../../domain/user.js';
import { createUserService } from '../../application/handle-user.js';
import { createFakeUserStore } from '../fake-user-store.js';
import { createFakeWebAuthnVerifier } from '../fake-webauthn-verifier.js';
import { createSqlitePasskeyCredentialStore } from '../sqlite-passkey-credential-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compilePasskeyPlan } from './compile-passkey.js';

const NOW = '2024-01-15T10:00:00.000Z';
const USER = '550e8400-e29b-41d4-a716-446655440001';
const SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hmac';

const human = (): User => ({
  id: USER,
  email: 'ada@example.com',
  createdAt: NOW,
});

const material = {
  id: 'new-credential-id',
  publicKey: 'cHVibGlj',
  counter: 0,
  transports: ['internal'] as const,
  deviceType: 'multiDevice' as const,
  backedUp: true,
};

describe('passkey unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;
  let reads: PasskeyCredentialStore;
  let verifier: ReturnType<typeof createFakeWebAuthnVerifier>;
  let clock: ReturnType<typeof createFakeClock>;

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM passkey_credentials' });
    await db.execute({ sql: 'DELETE FROM users' });
  };

  const insertUser = async () => {
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: [USER, 'ada@example.com', NOW],
    });
  };

  const service = () =>
    createPasskeyService({
      credentialStore: {
        save: () => {
          throw new Error('passkey writes go through the unit of work');
        },
        updateCounter: () => {
          throw new Error('passkey writes go through the unit of work');
        },
        updateLastUsed: () => {
          throw new Error('passkey writes go through the unit of work');
        },
        delete: () => {
          throw new Error('passkey writes go through the unit of work');
        },
        findById: (id) => reads.findById(id),
        findByUserId: (userId) => reads.findByUserId(userId),
      },
      userService: createUserService({
        userStore: createFakeUserStore({ initialUsers: [human()] }),
      }),
      clock,
      verifier,
      challenges: createChallengeManager({ secret: SECRET, clock, crypto: nodeChallengeCrypto }),
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-passkey-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'passkey.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
    await client.execute({ sql: 'PRAGMA foreign_keys = ON' });
    reads = await createSqlitePasskeyCredentialStore(db);
  });

  afterAll(async () => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clear();
    clock = createFakeClock(new Date(NOW));
    verifier = createFakeWebAuthnVerifier();
  });

  it('does not guard the credential statements and does not use signup\'s conditional insert', () => {
    const saved = compilePasskeyPlan(
      planSavePasskey({ userId: USER, now: NOW, material, credentialName: 'Laptop' })
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]?.guard).toBe(false);
    expect(saved[0]?.verb).toBe('insert');
    expect(saved[0]?.sql).toContain('INSERT INTO passkey_credentials');
    expect(saved[0]?.sql).not.toContain('WHERE EXISTS');

    const used = compilePasskeyPlan(
      planRecordPasskeyUse({ credentialId: 'cred-1', newCounter: 6, lastUsedAt: NOW })
    );
    expect(used.map((statement) => statement.guard)).toEqual([false, false]);
    expect(used[0]?.sql).toBe('UPDATE passkey_credentials SET counter = ? WHERE id = ?');
    expect(used[1]?.sql).toBe('UPDATE passkey_credentials SET last_used_at = ? WHERE id = ?');

    const deleted = compilePasskeyPlan(planDeletePasskey('cred-1'));
    expect(deleted).toEqual([
      {
        verb: 'delete',
        sql: 'DELETE FROM passkey_credentials WHERE id = ?',
        args: ['cred-1'],
        guard: false,
      },
    ]);
  });

  it('commits a registration and leaves planRegistrationCredential unwritten', async () => {
    await insertUser();
    verifier.setRegistrationVerification({ verified: true, ...material });
    const passkeys = service();
    const options = await passkeys.generateRegistrationOptions(USER);
    const challenge = options._unsafeUnwrap().challenge;

    const planned = await passkeys.planRegistrationCredential({
      userId: USER,
      challenge,
      response: {},
    });
    expect(planned.isOk() && planned.value.id).toBe('new-credential-id');
    expect((await reads.findById('new-credential-id'))._unsafeUnwrap()).toBeNull();

    const signupOptions = await passkeys.generateSignupRegistrationOptions({
      email: 'ada@example.com',
      identifier: 'ada@example.com',
    });
    const saved = await passkeys.verifyRegistration({
      userId: USER,
      challenge: signupOptions._unsafeUnwrap().challenge,
      response: {},
      credentialName: 'Laptop',
      skipUserIdCheck: true,
    });

    expect(saved.isOk() && saved._unsafeUnwrap()).toEqual({
      id: 'new-credential-id',
      userId: USER,
      publicKey: 'cHVibGlj',
      counter: 0,
      transports: ['internal'],
      deviceType: 'multiDevice',
      backedUp: true,
      name: 'Laptop',
      createdAt: NOW,
      lastUsedAt: undefined,
    });
    const row = await db.execute({
      sql: `SELECT id, user_id AS userId, name, counter, last_used_at AS lastUsedAt
            FROM passkey_credentials WHERE id = ?`,
      args: ['new-credential-id'],
    });
    expect(row.rows[0]).toEqual({
      id: 'new-credential-id',
      userId: USER,
      name: 'Laptop',
      counter: 0,
      lastUsedAt: null,
    });
  });

  it('commits the counter and last-used updates together', async () => {
    await insertUser();
    await db.execute({
      sql: `INSERT INTO passkey_credentials (
              id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['cred-1', USER, 'cHVibGlj', 5, '["internal"]', 'multiDevice', 1, null, NOW],
    });
    verifier.setAuthenticationVerification({ verified: true, newCounter: 6 });
    const passkeys = service();
    const options = await passkeys.generateAuthenticationOptions(USER);
    const verified = await passkeys.verifyAuthentication({
      challenge: options._unsafeUnwrap().challenge,
      response: { id: 'cred-1' },
    });

    expect(verified.isOk() && verified._unsafeUnwrap()).toEqual({
      userId: USER,
      credentialId: 'cred-1',
    });
    const row = await db.execute({
      sql: `SELECT counter, last_used_at AS lastUsedAt FROM passkey_credentials WHERE id = ?`,
      args: ['cred-1'],
    });
    expect(row.rows[0]).toEqual({ counter: 6, lastUsedAt: NOW });
  });

  it('commits a delete after the last-passkey guard and refuses the final credential', async () => {
    await insertUser();
    await db.execute({
      sql: `INSERT INTO passkey_credentials (
              id, user_id, public_key, counter, device_type, backed_up, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'cred-1', USER, 'cHVibGlj', 0, 'multiDevice', 1, NOW,
        'cred-2', USER, 'cHVibGlj', 0, 'multiDevice', 1, NOW,
      ],
    });
    const passkeys = service();
    const deleted = await passkeys.deleteCredentialForUser({ credentialId: 'cred-1', userId: USER });
    expect(deleted.isOk()).toBe(true);
    expect((await reads.findById('cred-1'))._unsafeUnwrap()).toBeNull();

    const refused = await passkeys.deleteCredentialForUser({ credentialId: 'cred-2', userId: USER });
    expect(refused.isErr() && refused.error.type).toBe('CANNOT_DELETE_LAST_PASSKEY');
    expect((await reads.findById('cred-2'))._unsafeUnwrap()?.id).toBe('cred-2');
  });
});
