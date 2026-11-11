import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import { createInMemoryUnitOfWork } from '../../platform/unit-of-work/in-memory-unit-of-work.js';
import { createTestDatabase, type Database } from '../../platform/database/test-utils.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { loadActorNamesFromSqlite } from '../infrastructure/load-actor-names.js';
import { loadNamedAgentFromSqlite } from '../infrastructure/load-named-agent.js';
import { loadOrgPersonFromSqlite } from '../infrastructure/load-org-person.js';
import { createSqliteOrganizationMembershipStore } from '../infrastructure/sqlite-organization-membership-store.js';
import { createSqliteOrganizationTimeZone } from '../infrastructure/sqlite-organization-time-zone.js';
import { createSqliteUserStore } from '../infrastructure/sqlite-user-store.js';
import type { AccessStorageError } from './access-types.js';
import { createAccess, type Access, type AccessDependencies } from './create-access.js';
import type { TokenService } from './handle-token.js';

const at = '2026-11-11T00:00:00.000Z';

const accessStorage = (message: string): AccessStorageError => ({
  type: 'ACCESS_STORAGE',
  message,
});

const insertOrg = (db: Database, id: string) =>
  db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: [id, id, at],
  });

const insertUser = (
  db: Database,
  id: string,
  email: string,
  name: string | null,
  kind: 'human' | 'agent'
) =>
  db.execute({
    sql: `INSERT INTO users (id, email, name, kind, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, email, name, kind, at],
  });

const insertMembership = (
  db: Database,
  id: string,
  userId: string,
  organizationId: string,
  role: 'owner' | 'admin' | 'member',
  joinedAt: string
) =>
  db.execute({
    sql: `INSERT INTO organization_memberships (
            id, user_id, organization_id, role, is_personal_org, joined_at
          ) VALUES (?, ?, ?, ?, 0, ?)`,
    args: [id, userId, organizationId, role, joinedAt],
  });

describe('published access queries', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await insertOrg(db, 'org-1');
    await insertOrg(db, 'org-2');
    await insertUser(db, 'human-mirror', 'human-mirror@example.com', 'Notes Mirror', 'human');
    await insertUser(db, 'agent-early', 'agent-early@example.com', 'Notes Mirror', 'agent');
    await insertUser(db, 'agent-late', 'agent-late@example.com', 'Notes Mirror', 'agent');
    await insertUser(db, 'member-blank', 'blank@example.com', '', 'human');
    await insertUser(db, 'admin-1', 'bea@example.com', 'Bea', 'human');
    await insertUser(db, 'owner-1', 'ada@example.com', 'Ada', 'human');
    await insertUser(db, 'only-blank', 'only@example.com', '', 'human');
    await insertMembership(db, 'm-human', 'human-mirror', 'org-1', 'member', '2017-01-01T00:00:00.000Z');
    await insertMembership(db, 'm-early', 'agent-early', 'org-1', 'member', '2018-01-01T00:00:00.000Z');
    await insertMembership(db, 'm-late', 'agent-late', 'org-1', 'member', '2019-01-01T00:00:00.000Z');
    await insertMembership(db, 'm-blank', 'member-blank', 'org-1', 'member', '2019-06-01T00:00:00.000Z');
    await insertMembership(db, 'm-admin', 'admin-1', 'org-1', 'admin', '2020-01-01T00:00:00.000Z');
    await insertMembership(db, 'm-owner', 'owner-1', 'org-1', 'owner', '2021-01-01T00:00:00.000Z');
    await insertMembership(db, 'm-only', 'only-blank', 'org-2', 'member', '2020-01-01T00:00:00.000Z');
  });

  afterEach(async () => {
    await db.close();
  });

  const published = async (): Promise<Access['queries']> => {
    const userStore = await createSqliteUserStore(db);
    const membershipStore = await createSqliteOrganizationMembershipStore(db);
    const deps = {
      tokenService: { validateToken: () => { throw new Error('unused'); } } as TokenService,
      sessionService: null,
      userStore,
      membershipStore,
      invitationStore: createFakeInvitationStore(),
      organizationStore: createFakeOrganizationStore(),
      loadOrganizationTimeZone: createSqliteOrganizationTimeZone(db),
      loadFirstHuman: (organizationId: string) =>
        loadOrgPersonFromSqlite(db)(organizationId).mapErr((error) => accessStorage(error.message)),
      loadNamedAgent: (input: { organizationId: string; name: string }) =>
        loadNamedAgentFromSqlite(db)(input).mapErr((error) => accessStorage(error.message)),
      loadActorNames: (ids: readonly string[]) =>
        loadActorNamesFromSqlite(db)(ids).mapErr((error) => accessStorage(error.message)),
      clock: createFakeClock(new Date(at)),
      idGenerator: createFakeIdGenerator(),
      unitOfWork: createInMemoryUnitOfWork({ participants: [] }),
      signupService: { completeSignup: () => { throw new Error('unused'); } },
    } as AccessDependencies;
    return createAccess(deps).queries;
  };

  it('reads membership, display names, the first human, and the named agent', async () => {
    const queries = await published();

    const present = await queries.principalExistsInOrganization({
      userId: 'owner-1',
      organizationId: 'org-1',
    });
    const absent = await queries.principalExistsInOrganization({
      userId: 'missing',
      organizationId: 'org-1',
    });
    expect(present._unsafeUnwrap()).toBe(true);
    expect(absent._unsafeUnwrap()).toBe(false);

    const members = await queries.memberIds('org-1');
    expect(new Set(members._unsafeUnwrap())).toEqual(
      new Set(['human-mirror', 'agent-early', 'agent-late', 'member-blank', 'admin-1', 'owner-1'])
    );

    const names = await queries.userDisplayNames(['owner-1', 'member-blank', 'missing']);
    expect(
      names
        ._unsafeUnwrap()
        .map((name) => [name.id, name.displayName])
        .sort(([left], [right]) => left.localeCompare(right))
    ).toEqual([
      ['member-blank', 'blank@example.com'],
      ['owner-1', 'Ada'],
    ]);

    const actors = await queries.actorNames(['member-blank', 'owner-1', 'missing']);
    expect(
      actors
        ._unsafeUnwrap()
        .map((actor) => [actor.id, actor.name])
        .sort(([left], [right]) => left.localeCompare(right))
    ).toEqual([
      ['member-blank', ''],
      ['owner-1', 'Ada'],
    ]);

    const person = await queries.firstHuman('org-1');
    expect(person._unsafeUnwrap()).toEqual({ userId: 'owner-1', name: 'Ada' });
    const blankPerson = await queries.firstHuman('org-2');
    expect(blankPerson._unsafeUnwrap()).toEqual({
      userId: 'only-blank',
      name: 'only@example.com',
    });

    const agent = await queries.namedAgent({ organizationId: 'org-1', name: 'Notes Mirror' });
    expect(agent._unsafeUnwrap()).toBe('agent-early');
  });
});
