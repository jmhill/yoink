import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { okAsync } from 'neverthrow';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator, createFakePasswordHasher } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createAgentService } from '../../application/handle-agent.js';
import type { MintAgentPlan } from '../../domain/agent-plan.js';
import { planMintAgent } from '../../domain/decide-mint-agent.js';
import type { OrganizationMembership } from '../../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../../domain/organization-membership-store.js';
import type { Organization } from '../../domain/organization.js';
import type { OrganizationStore } from '../../domain/organization-store.js';
import type { TokenStore } from '../../domain/token-store.js';
import type { UserStore } from '../../domain/user-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileMintAgentPlan } from './compile-agent.js';

const NOW = '2024-01-15T10:00:00.000Z';
const ORG = '550e8400-e29b-41d4-a716-446655440001';
const OWNER = '550e8400-e29b-41d4-a716-446655440010';
const USER = '550e8400-e29b-41d4-a716-446655440100';
const MEMBERSHIP = '550e8400-e29b-41d4-a716-446655440101';
const TOKEN = '550e8400-e29b-41d4-a716-446655440102';
const SECRET = '550e8400-e29b-41d4-a716-446655440103';

const organization: Organization = {
  id: ORG,
  name: 'Team Org',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ownerMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: OWNER,
  organizationId: ORG,
  role: 'owner',
  isPersonalOrg: true,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const plan = (): MintAgentPlan =>
  planMintAgent({
    decision: { organizationId: ORG, name: 'Vault bot' },
    userId: USER,
    membershipId: MEMBERSHIP,
    tokenId: TOKEN,
    tokenHash: `fake-hash:${SECRET}`,
    now: NOW,
  });

describe('mint agent unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const count = async (sql: string, args: readonly unknown[] = []): Promise<number> => {
    const result = await db.execute({ sql, args: [...args] });
    return Number(result.rows[0]?.n ?? 0);
  };

  const commit = (mint: MintAgentPlan) =>
    createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [accessSqlParticipant],
    }).commit([{ result: null, events: [], step: { owner: 'access', plan: mint } }]);

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM api_tokens' });
    await db.execute({ sql: 'DELETE FROM organization_memberships' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
  };

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-mint-agent-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'agent.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
  });

  afterAll(async () => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clear();
  });

  it('does not guard the user insert', () => {
    const compiled = compileMintAgentPlan(plan());
    expect(compiled).toHaveLength(3);
    expect(compiled.every((statement) => statement.guard === false)).toBe(true);
    expect(compiled[0]?.sql).toContain('INSERT INTO users');
    expect(compiled[0]?.sql).not.toContain('WHERE NOT EXISTS');
    expect(compiled[1]?.sql).toContain('INSERT INTO organization_memberships');
    expect(compiled[2]?.sql).toContain('INSERT INTO api_tokens');
  });

  it('rolls back the user when the membership cannot reference the workspace', async () => {
    const result = await commit(plan());

    expect(result.isErr() && result.error.kind).toBe('Storage');
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM api_tokens')).toBe(0);
  });

  it('leaves no rows when mintAgent commit fails', async () => {
    const service = createAgentService({
      userStore: {
        save: () => {
          throw new Error('user writes go through the unit of work');
        },
      } as unknown as UserStore,
      membershipStore: {
        findByUserAndOrg: () => okAsync(ownerMembership),
        save: () => {
          throw new Error('membership writes go through the unit of work');
        },
      } as unknown as OrganizationMembershipStore,
      organizationStore: {
        findById: () => okAsync(organization),
      } as unknown as OrganizationStore,
      tokenStore: {
        save: () => {
          throw new Error('token writes go through the unit of work');
        },
      } as unknown as TokenStore,
      clock: createFakeClock(new Date(NOW)),
      idGenerator: createFakeIdGenerator([USER, MEMBERSHIP, TOKEN, SECRET]),
      passwordHasher: createFakePasswordHasher(),
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

    const minted = await service.mintAgent({
      actor: { kind: 'user', userId: OWNER, via: 'session' },
      organizationId: ORG,
      name: 'Vault bot',
    });

    expect(minted.isErr() && minted.error.type).toBe('TOKEN_STORAGE_ERROR');
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM api_tokens')).toBe(0);
  });

  it('commits the user, membership, and hashed token together', async () => {
    await db.execute({
      sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)',
      args: [organization.id, organization.name, organization.createdAt],
    });
    const service = createAgentService({
      userStore: {
        save: () => {
          throw new Error('user writes go through the unit of work');
        },
      } as unknown as UserStore,
      membershipStore: {
        findByUserAndOrg: () => okAsync(ownerMembership),
      } as unknown as OrganizationMembershipStore,
      organizationStore: {
        findById: () => okAsync(organization),
      } as unknown as OrganizationStore,
      tokenStore: {
        save: () => {
          throw new Error('token writes go through the unit of work');
        },
      } as unknown as TokenStore,
      clock: createFakeClock(new Date(NOW)),
      idGenerator: createFakeIdGenerator([USER, MEMBERSHIP, TOKEN, SECRET]),
      passwordHasher: createFakePasswordHasher(),
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

    const minted = await service.mintAgent({
      actor: { kind: 'user', userId: OWNER, via: 'session' },
      organizationId: ORG,
      name: 'Vault bot',
    });

    expect(minted.isOk() && minted._unsafeUnwrap().rawToken).toBe(`${TOKEN}:${SECRET}`);
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE kind = ?', ['agent'])).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(1);
    const hash = await db.execute({
      sql: 'SELECT token_hash AS hash FROM api_tokens WHERE id = ?',
      args: [TOKEN],
    });
    expect(hash.rows[0]?.hash).toBe(`fake-hash:${SECRET}`);
  });
});
