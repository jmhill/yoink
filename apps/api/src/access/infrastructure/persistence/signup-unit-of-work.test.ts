import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { okAsync } from 'neverthrow';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { completeSignup } from '../../application/handle-signup.js';
import type { SignupPlan } from '../../domain/signup-plan.js';
import { createSqliteInvitationStore } from '../sqlite-invitation-store.js';
import { createSqliteOrganizationMembershipStore } from '../sqlite-organization-membership-store.js';
import { createSqliteOrganizationStore } from '../sqlite-organization-store.js';
import { createSqliteUserStore } from '../sqlite-user-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileSignupPlan } from './compile-signup.js';

const NOW = '2024-06-15T12:00:00.000Z';
const invitedOrg = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
};
const invitation = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'GARDEN01',
  email: 'libby@example.com',
  organizationId: invitedOrg.id,
  invitedByUserId: null,
  role: 'owner' as const,
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-15T12:00:00.000Z',
};

const planFor = (overrides?: {
  readonly email?: string;
  readonly sessionOrganizationId?: string;
}): SignupPlan => {
  const userId = '550e8400-e29b-41d4-a716-446655440010';
  const personalOrgId = '550e8400-e29b-41d4-a716-446655440011';
  const email = overrides?.email ?? 'libby@example.com';
  return {
    user: { id: userId, email, createdAt: NOW },
    personalOrganization: {
      id: personalOrgId,
      name: `${email}'s Workspace`,
      createdAt: NOW,
    },
    personalMembership: {
      id: '550e8400-e29b-41d4-a716-446655440021',
      userId,
      organizationId: personalOrgId,
      role: 'owner',
      isPersonalOrg: true,
      joinedAt: NOW,
    },
    invitedMembership: {
      id: '550e8400-e29b-41d4-a716-446655440022',
      userId,
      organizationId: invitedOrg.id,
      role: 'owner',
      isPersonalOrg: false,
      joinedAt: NOW,
    },
    accepted: {
      ...invitation,
      acceptedAt: NOW,
      acceptedByUserId: userId,
    },
    event: {
      type: 'OwnerAssigned',
      id: '550e8400-e29b-41d4-a716-446655440098',
      organizationId: invitedOrg.id,
      userId,
      fromRole: null,
      previousOwnerUserId: null,
      actor: { kind: 'self', userId },
      occurredAt: NOW,
    },
    credential: {
      id: 'credential-1',
      userId,
      publicKey: 'cHVibGlj',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      createdAt: NOW,
    },
    session: {
      id: '550e8400-e29b-41d4-a716-446655440099',
      userId,
      currentOrganizationId: overrides?.sessionOrganizationId ?? personalOrgId,
      createdAt: NOW,
      expiresAt: '2024-06-22T12:00:00.000Z',
      lastActiveAt: NOW,
    },
  };
};

describe('signup unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const count = async (sql: string, args: readonly unknown[] = []): Promise<number> => {
    const result = await db.execute({ sql, args: [...args] });
    return Number(result.rows[0]?.n ?? 0);
  };

  const commit = (plan: SignupPlan) =>
    createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [accessSqlParticipant],
    }).commit([
      { result: null, events: [], step: { owner: 'access', plan } },
    ]);

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-signup-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'signup.db') });
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
    await db.execute({ sql: 'DELETE FROM user_sessions' });
    await db.execute({ sql: 'DELETE FROM passkey_credentials' });
    await db.execute({ sql: 'DELETE FROM membership_events' });
    await db.execute({ sql: 'DELETE FROM invitations' });
    await db.execute({ sql: 'DELETE FROM organization_memberships' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
    const orgStore = await createSqliteOrganizationStore(db);
    await orgStore.save(invitedOrg);
    const invitationStore = await createSqliteInvitationStore(db);
    await invitationStore.save(invitation);
  });

  it('commits the user, organization, memberships, credential, and session together', async () => {
    const plan = planFor();
    const statements = compileSignupPlan(plan);
    expect(statements[0]?.guard).toBe(true);
    expect(statements[0]?.sql).toContain('WHERE NOT EXISTS');
    expect(statements.at(-1)?.sql).toContain('user_sessions');

    const result = await commit(plan);
    expect(result.isOk()).toBe(true);
    expect(await count(`SELECT COUNT(*) AS n FROM users WHERE email = ?`, [plan.user.email])).toBe(1);
    expect(
      await count(`SELECT COUNT(*) AS n FROM organizations WHERE id = ?`, [
        plan.personalOrganization.id,
      ])
    ).toBe(1);
    expect(
      await count(`SELECT COUNT(*) AS n FROM organization_memberships WHERE user_id = ?`, [
        plan.user.id,
      ])
    ).toBe(2);
    expect(
      await count(`SELECT COUNT(*) AS n FROM passkey_credentials WHERE user_id = ?`, [plan.user.id])
    ).toBe(1);
    expect(
      await count(`SELECT COUNT(*) AS n FROM user_sessions WHERE id = ?`, [plan.session.id])
    ).toBe(1);
    const accepted = await db.execute({
      sql: `SELECT accepted_at FROM invitations WHERE id = ?`,
      args: [invitation.id],
    });
    expect(accepted.rows[0]?.accepted_at).toBe(NOW);
  });

  it('returns Conflict when the email is already taken and leaves no signup rows', async () => {
    const userStore = await createSqliteUserStore(db);
    const saved = await userStore.save({
      id: '550e8400-e29b-41d4-a716-446655440077',
      email: 'libby@example.com',
      createdAt: NOW,
    });
    expect(saved.isOk()).toBe(true);

    const plan = planFor();
    const result = await commit(plan);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Conflict',
        owner: 'access',
        reason: 'guard-miss',
      });
    }
    expect(await count(`SELECT COUNT(*) AS n FROM users`)).toBe(1);
    expect(
      await count(`SELECT COUNT(*) AS n FROM organizations WHERE id = ?`, [
        plan.personalOrganization.id,
      ])
    ).toBe(0);
    expect(
      await count(`SELECT COUNT(*) AS n FROM organization_memberships WHERE user_id = ?`, [
        plan.user.id,
      ])
    ).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM passkey_credentials`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM user_sessions`)).toBe(0);
    const accepted = await db.execute({
      sql: `SELECT accepted_at FROM invitations WHERE id = ?`,
      args: [invitation.id],
    });
    expect(accepted.rows[0]?.accepted_at).toBeNull();
  });

  it('rolls back every signup row when the last statement fails', async () => {
    const plan = planFor({ sessionOrganizationId: 'missing-org' });
    const statements = compileSignupPlan(plan);
    expect(statements.at(-1)?.sql).toContain('INSERT INTO user_sessions');
    expect(statements.at(-1)?.args).toContain('missing-org');

    const result = await commit(plan);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('Storage');
      if (result.error.kind === 'Storage') {
        expect(result.error.owner).toBe('access');
        expect(result.error.owners).toEqual(['access']);
      }
    }
    expect(await count(`SELECT COUNT(*) AS n FROM users`)).toBe(0);
    expect(
      await count(`SELECT COUNT(*) AS n FROM organizations WHERE id = ?`, [
        plan.personalOrganization.id,
      ])
    ).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM organization_memberships`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM passkey_credentials`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM user_sessions`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM membership_events`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM organizations WHERE id = ?`, [invitedOrg.id])).toBe(
      1
    );
    const accepted = await db.execute({
      sql: `SELECT accepted_at FROM invitations WHERE id = ?`,
      args: [invitation.id],
    });
    expect(accepted.rows[0]?.accepted_at).toBeNull();
  });

  it('maps a hidden email race through the command to Conflict, not a thrown constraint', async () => {
    const userStore = await createSqliteUserStore(db);
    const saved = await userStore.save({
      id: '550e8400-e29b-41d4-a716-446655440077',
      email: 'Libby@Example.com',
      createdAt: NOW,
    });
    expect(saved.isOk()).toBe(true);
    const hiddenRead = {
      ...userStore,
      findByNormalizedEmail: () => okAsync(null),
    };
    const organizationStore = await createSqliteOrganizationStore(db);
    const invitationStore = await createSqliteInvitationStore(db);
    const membershipStore = await createSqliteOrganizationMembershipStore(db);

    const result = await completeSignup(
      {
        code: invitation.code,
        email: 'libby@example.com',
        challenge: 'challenge',
        credential: {
          id: 'cred',
          rawId: 'cred',
          response: {
            clientDataJSON: 'e30',
            attestationObject: 'e30',
          },
          type: 'public-key',
          clientExtensionResults: {},
        },
      },
      {
        invitationStore,
        userStore: hiddenRead,
        organizationStore,
        membershipStore,
        clock: createFakeClock(new Date(NOW)),
        idGenerator: createFakeIdGenerator(),
        unitOfWork: createSqliteUnitOfWork({
          client: libsqlWriteClient(client),
          participants: [accessSqlParticipant],
        }),
        verifySignupCredential: ({ userId }) =>
          okAsync({
            id: 'credential-raced',
            userId,
            publicKey: 'cHVibGlj',
            counter: 0,
            deviceType: 'singleDevice',
            backedUp: false,
            createdAt: NOW,
          }),
        sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('EMAIL_ALREADY_REGISTERED');
    }
    expect(await count(`SELECT COUNT(*) AS n FROM users`)).toBe(1);
    expect(await count(`SELECT COUNT(*) AS n FROM passkey_credentials`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM user_sessions`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM organization_memberships`)).toBe(0);
  });
});
