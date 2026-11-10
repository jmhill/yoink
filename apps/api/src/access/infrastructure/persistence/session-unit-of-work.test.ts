import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { errAsync, okAsync } from 'neverthrow';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createSessionService } from '../../application/handle-session.js';
import { createMembershipService } from '../../application/handle-membership.js';
import {
  planDeleteExpiredSessions,
  planRefreshSession,
  planRevokeSession,
  planRevokeUserSessions,
  planSaveSession,
  planSwitchSessionOrganization,
} from '../../domain/session-plan.js';
import type { UserSession } from '../../domain/user-session.js';
import type { UserSessionStore } from '../../domain/user-session-store.js';
import type { User } from '../../domain/user.js';
import { createUserService } from '../../domain/user-service.js';
import { createFakeOrganizationMembershipStore } from '../fake-organization-membership-store.js';
import { createFakeOrganizationStore } from '../fake-organization-store.js';
import { createFakeUserStore } from '../fake-user-store.js';
import { createSqliteUserSessionStore } from '../sqlite-user-session-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileSessionPlan } from './compile-session.js';

const NOW = '2024-06-15T12:00:00.000Z';
const USER = '550e8400-e29b-41d4-a716-446655440001';
const ORG = '550e8400-e29b-41d4-a716-446655440010';
const OTHER = '550e8400-e29b-41d4-a716-446655440011';
const SESSION = '550e8400-e29b-41d4-a716-446655440020';
const TTL = 7 * 24 * 60 * 60 * 1000;

const human = (): User => ({
  id: USER,
  email: 'alice@example.com',
  createdAt: NOW,
});

const sample = (): UserSession => ({
  id: SESSION,
  userId: USER,
  currentOrganizationId: ORG,
  createdAt: NOW,
  expiresAt: '2024-06-22T12:00:00.000Z',
  lastActiveAt: NOW,
});

describe('session unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;
  let reads: UserSessionStore;
  let clock: ReturnType<typeof createFakeClock>;

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM user_sessions' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
  };

  const insertParents = async () => {
    await db.execute({
      sql: 'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
      args: [USER, 'alice@example.com', NOW],
    });
    await db.execute({
      sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)',
      args: [ORG, 'Personal', NOW],
    });
    await db.execute({
      sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)',
      args: [OTHER, 'Team', NOW],
    });
  };

  const service = () => {
    const userService = createUserService({
      userStore: createFakeUserStore({ initialUsers: [human()] }),
    });
    const membershipService = createMembershipService({
      membershipStore: createFakeOrganizationMembershipStore({
        initialMemberships: [
          {
            id: '550e8400-e29b-41d4-a716-446655440030',
            userId: USER,
            organizationId: ORG,
            role: 'owner',
            isPersonalOrg: true,
            joinedAt: NOW,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440031',
            userId: USER,
            organizationId: OTHER,
            role: 'member',
            isPersonalOrg: false,
            joinedAt: NOW,
          },
        ],
      }),
      userService,
      organizationStore: createFakeOrganizationStore({
        initialOrganizations: [
          { id: ORG, name: 'Personal', createdAt: NOW },
          { id: OTHER, name: 'Team', createdAt: NOW },
        ],
      }),
      clock,
      idGenerator: createFakeIdGenerator(),
    });
    const refusing: UserSessionStore = {
      save: () => errAsync({ type: 'SESSION_STORAGE_ERROR', message: 'writes go through the unit of work' }),
      findById: (id) => reads.findById(id),
      findByUserId: (userId) => reads.findByUserId(userId),
      updateLastActive: () =>
        errAsync({ type: 'SESSION_STORAGE_ERROR', message: 'writes go through the unit of work' }),
      updateCurrentOrganization: () =>
        errAsync({ type: 'SESSION_STORAGE_ERROR', message: 'writes go through the unit of work' }),
      delete: () => errAsync({ type: 'SESSION_STORAGE_ERROR', message: 'writes go through the unit of work' }),
      deleteByUserId: () =>
        errAsync({ type: 'SESSION_STORAGE_ERROR', message: 'writes go through the unit of work' }),
      deleteExpired: () =>
        errAsync({ type: 'SESSION_STORAGE_ERROR', message: 'writes go through the unit of work' }),
      countExpired: (now) => reads.countExpired(now),
    };
    return createSessionService({
      sessionStore: refusing,
      userService,
      membershipService,
      clock,
      idGenerator: { generate: () => SESSION },
      sessionTtlMs: TTL,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });
  };

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-session-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'session.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
    await client.execute({ sql: 'PRAGMA foreign_keys = ON' });
    reads = await createSqliteUserSessionStore(db);
  });

  afterAll(async () => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clear();
    clock = createFakeClock(new Date(NOW));
  });

  it('compiles the store statements and does not guard them', () => {
    const saved = compileSessionPlan(planSaveSession(sample()));
    expect(saved).toHaveLength(1);
    expect(saved[0]?.guard).toBe(false);
    expect(saved[0]?.verb).toBe('insert');
    expect(saved[0]?.sql).toContain('INSERT INTO user_sessions');
    expect(saved[0]?.sql).not.toContain('WHERE EXISTS');

    expect(compileSessionPlan(planRefreshSession({ sessionId: SESSION, lastActiveAt: NOW }))).toEqual([
      {
        verb: 'update',
        sql: 'UPDATE user_sessions SET last_active_at = ? WHERE id = ?',
        args: [NOW, SESSION],
        guard: false,
      },
    ]);
    expect(compileSessionPlan(planRevokeSession(SESSION))).toEqual([
      {
        verb: 'delete',
        sql: 'DELETE FROM user_sessions WHERE id = ?',
        args: [SESSION],
        guard: false,
      },
    ]);
    expect(compileSessionPlan(planRevokeUserSessions(USER))).toEqual([
      {
        verb: 'delete',
        sql: 'DELETE FROM user_sessions WHERE user_id = ?',
        args: [USER],
        guard: false,
      },
    ]);
    expect(
      compileSessionPlan(planSwitchSessionOrganization({ sessionId: SESSION, organizationId: OTHER }))
    ).toEqual([
      {
        verb: 'update',
        sql: 'UPDATE user_sessions SET current_organization_id = ? WHERE id = ?',
        args: [OTHER, SESSION],
        guard: false,
      },
    ]);
    expect(compileSessionPlan(planDeleteExpiredSessions(NOW))).toEqual([
      {
        verb: 'delete',
        sql: 'DELETE FROM user_sessions WHERE expires_at < ?',
        args: [NOW],
        guard: false,
      },
    ]);
  });

  it('commits create, refresh, switch, revoke, and cleanup through one access plan each', async () => {
    await insertParents();
    const sessions = service();

    const created = await sessions.createSession({ userId: USER });
    expect(created.isOk() && created.value.currentOrganizationId).toBe(ORG);
    expect((await reads.findById(SESSION))._unsafeUnwrap()?.userId).toBe(USER);

    const missing = await sessions.revokeSession('550e8400-e29b-41d4-a716-446655440099');
    expect(missing.isOk()).toBe(true);
    expect((await reads.findById(SESSION))._unsafeUnwrap()?.id).toBe(SESSION);

    clock.advanceBy(2 * 24 * 60 * 60 * 1000);
    const refreshed = await sessions.refreshSession(SESSION);
    expect(refreshed.isOk() && refreshed.value).toBe(true);
    expect((await reads.findById(SESSION))._unsafeUnwrap()?.lastActiveAt).toBe(
      '2024-06-17T12:00:00.000Z'
    );

    const switched = await sessions.switchOrganization(SESSION, OTHER);
    expect(switched.isOk()).toBe(true);
    expect((await reads.findById(SESSION))._unsafeUnwrap()?.currentOrganizationId).toBe(OTHER);

    const revoked = await sessions.revokeSession(SESSION);
    expect(revoked.isOk()).toBe(true);
    expect((await reads.findById(SESSION))._unsafeUnwrap()).toBeNull();

    const again = await sessions.createSession({ userId: USER, organizationId: OTHER });
    expect(again.isOk() && again.value.currentOrganizationId).toBe(OTHER);
    const all = await sessions.revokeAllUserSessions(USER);
    expect(all.isOk()).toBe(true);
    expect((await reads.findByUserId(USER))._unsafeUnwrap()).toEqual([]);

    await sessions.createSession({ userId: USER });
    clock.advanceBy(8 * 24 * 60 * 60 * 1000);
    const cleaned = await sessions.cleanupExpiredSessions();
    expect(cleaned.isOk() && cleaned.value).toBe(1);
    expect((await reads.findById(SESSION))._unsafeUnwrap()).toBeNull();
  });

  it('does not write when the user is missing', async () => {
    await insertParents();
    const sessions = createSessionService({
      sessionStore: {
        save: () => okAsync(undefined),
        findById: (id) => reads.findById(id),
        findByUserId: (userId) => reads.findByUserId(userId),
        updateLastActive: () => okAsync(undefined),
        updateCurrentOrganization: () => okAsync(undefined),
        delete: () => okAsync(undefined),
        deleteByUserId: () => okAsync(undefined),
        deleteExpired: () => okAsync(0),
        countExpired: (now) => reads.countExpired(now),
      },
      userService: createUserService({ userStore: createFakeUserStore({ initialUsers: [] }) }),
      membershipService: createMembershipService({
        membershipStore: createFakeOrganizationMembershipStore({ initialMemberships: [] }),
        userService: createUserService({ userStore: createFakeUserStore({ initialUsers: [] }) }),
        organizationStore: createFakeOrganizationStore({ initialOrganizations: [] }),
        clock,
        idGenerator: createFakeIdGenerator(),
      }),
      clock,
      idGenerator: { generate: () => SESSION },
      sessionTtlMs: TTL,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });
    const result = await sessions.createSession({ userId: USER });
    expect(result.isErr() && result.error.type).toBe('USER_NOT_FOUND');
    expect((await reads.findById(SESSION))._unsafeUnwrap()).toBeNull();
  });
});
