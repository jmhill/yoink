import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { okAsync } from 'neverthrow';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { handleCreateToken } from '../../application/handle-create-token.js';
import { handleListTokens } from '../../application/handle-list-tokens.js';
import { handleRevokeToken } from '../../application/handle-revoke-token.js';
import { planIssueToken, planRevokeToken } from '../../domain/token-plan.js';
import { createSqliteTokenStore } from '../sqlite-token-store.js';
import type { TokenStore } from '../../domain/token-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileTokenPlan } from './compile-token.js';

const NOW = '2026-01-01T00:00:00.000Z';
const USER = '550e8400-e29b-41d4-a716-446655440001';
const ORG = '550e8400-e29b-41d4-a716-446655440010';
const TOKEN = '550e8400-e29b-41d4-a716-446655440020';
const SIBLING = '550e8400-e29b-41d4-a716-446655440021';

const actor = { kind: 'user' as const, userId: USER, via: 'session' as const };

describe('compileTokenPlan', () => {
  it('inserts the hash and not the secret', () => {
    const compiled = compileTokenPlan(
      planIssueToken({
        id: TOKEN,
        userId: USER,
        organizationId: ORG,
        tokenHash: 'hashed-secret',
        name: 'Lane',
        createdAt: NOW,
      })
    );
    expect(compiled).toEqual([
      {
        verb: 'insert',
        sql: `
            INSERT INTO api_tokens (id, user_id, organization_id, token_hash, name, last_used_at, created_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        args: [TOKEN, USER, ORG, 'hashed-secret', 'Lane', null, NOW, null],
        guard: false,
      },
    ]);
    expect(compiled[0]?.args).not.toContain('plain-secret');
  });

  it('revokes with the store update and does not guard a missing row', () => {
    expect(
      compileTokenPlan(planRevokeToken({ tokenId: TOKEN, revokedAt: NOW }))
    ).toEqual([
      {
        verb: 'update',
        sql: `UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
        args: [NOW, TOKEN],
        guard: false,
      },
    ]);
  });
});

describe('token unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;
  let tokens: TokenStore;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-token-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'token.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    tokens = await createSqliteTokenStore(db);
  });

  afterAll(() => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await db.execute({ sql: 'DELETE FROM api_tokens' });
  });

  const unitOfWork = () =>
    createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [accessSqlParticipant],
    });

  const issue = (id: string, name: string) =>
    handleCreateToken(
      { actor, userId: USER, organizationId: ORG, name },
      {
        listUserOrgTokens: (userId, organizationId) =>
          tokens.findByUserAndOrganization(userId, organizationId),
        loadMembership: () => okAsync({ role: 'owner' }),
        loadOwner: () => okAsync({ userId: USER, kind: 'human' }),
        hashSecret: (secret) => okAsync(`hashed:${secret}`),
        nextId: () => id,
        nextSecret: () => `secret-${id}`,
        now: () => NOW,
        maxTokensPerUserPerOrg: 10,
        unitOfWork: unitOfWork(),
      }
    );

  it('issues and revokes through one access plan and lists metadata only', async () => {
    const created = await issue(TOKEN, 'Lane');
    expect(created.isOk() && created.value.rawToken).toBe(`${TOKEN}:secret-${TOKEN}`);
    if (created.isOk()) {
      expect(JSON.stringify(created.value.token)).not.toContain('hashed:');
      expect(JSON.stringify(created.value.token)).not.toContain('secret-');
    }

    const stored = (await tokens.findById(TOKEN))._unsafeUnwrap();
    expect(stored?.tokenHash).toBe(`hashed:secret-${TOKEN}`);
    expect(stored?.name).toBe('Lane');

    const sibling = await issue(SIBLING, 'Sibling');
    expect(sibling.isOk()).toBe(true);

    const listed = await handleListTokens(
      { actor, userId: USER, organizationId: ORG },
      {
        listUserOrgTokens: (userId, organizationId) =>
          tokens.findByUserAndOrganization(userId, organizationId),
      }
    );
    expect(listed._unsafeUnwrap().tokens.map((token) => token.id).sort()).toEqual(
      [SIBLING, TOKEN].sort()
    );
    expect(JSON.stringify(listed._unsafeUnwrap())).not.toContain('hashed:');
    expect(JSON.stringify(listed._unsafeUnwrap())).not.toContain('secret-');

    const revoked = await handleRevokeToken(
      { actor, tokenId: TOKEN, userId: USER, organizationId: ORG },
      {
        load: (id) => tokens.findById(id),
        now: () => '2026-02-01T00:00:00.000Z',
        unitOfWork: unitOfWork(),
      }
    );
    expect(revoked.isOk()).toBe(true);
    expect((await tokens.findById(TOKEN))._unsafeUnwrap()?.revokedAt).toBe('2026-02-01T00:00:00.000Z');

    const after = await handleListTokens(
      { actor, userId: USER, organizationId: ORG },
      {
        listUserOrgTokens: (userId, organizationId) =>
          tokens.findByUserAndOrganization(userId, organizationId),
      }
    );
    expect(after.isOk() && after.value.tokens.map((token) => token.id)).toEqual([SIBLING]);
  });

  it('does not write when the token is already revoked', async () => {
    const created = await issue(TOKEN, 'Lane');
    expect(created.isOk()).toBe(true);
    const first = await handleRevokeToken(
      { actor, tokenId: TOKEN, userId: USER, organizationId: ORG },
      {
        load: (id) => tokens.findById(id),
        now: () => '2026-02-01T00:00:00.000Z',
        unitOfWork: unitOfWork(),
      }
    );
    expect(first.isOk()).toBe(true);
    const second = await handleRevokeToken(
      { actor, tokenId: TOKEN, userId: USER, organizationId: ORG },
      {
        load: (id) => tokens.findById(id),
        now: () => '2026-03-01T00:00:00.000Z',
        unitOfWork: unitOfWork(),
      }
    );
    expect(second.isErr() && second.error.type).toBe('USER_TOKEN_NOT_FOUND');
    expect((await tokens.findById(TOKEN))._unsafeUnwrap()?.revokedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
