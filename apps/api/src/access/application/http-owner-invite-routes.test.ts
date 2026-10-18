import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { errAsync } from 'neverthrow';
import {
  ACCEPT_INVITE_STORAGE_MESSAGE,
  BOT_CANNOT_BE_OWNER_MESSAGE,
  CREATE_OWNER_INVITE_STORAGE_MESSAGE,
  CREATE_WORKSPACE_STORAGE_MESSAGE,
  EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE,
  INVITATION_ALREADY_USED_MESSAGE,
  INVITATION_EXPIRED_MESSAGE,
  INVITATION_NOT_FOUND_MESSAGE,
  INVITATION_REPLACED_MESSAGE,
  OWNER_EMAIL_REQUIRED_MESSAGE,
  OWNER_INVITE_ADMIN_ONLY_MESSAGE,
  OWNER_INVITE_WRONG_EMAIL_MESSAGE,
  WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
} from '@yoink/api-contracts';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import {
  bootstrapApp,
  createInfrastructure,
} from '../../composition-root.js';
import { runMigrations } from '../../database/migrator.js';
import { migrations } from '../../database/migrations.js';
import {
  createTestAppFull,
  TEST_ADMIN_PASSWORD,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_USER_ID,
  testConfigFull,
} from '../../tests/helpers/test-app.js';
import { ADMIN_SESSION_COOKIE } from './admin-session-middleware.js';
import { registerAdminRoutes } from './admin-routes.js';
import { registerInvitationRoutes } from './invitation-routes.js';
import { createAdminSessionService } from '../domain/admin-session-service.js';
import { createAdminService } from '../domain/admin-service.js';
import { createInvitationService } from '../domain/invitation-service.js';
import { createUserService } from '../domain/user-service.js';
import { createMembershipService } from '../domain/membership-service.js';
import { createOrganizationService } from '../domain/organization-service.js';
import { createCombinedAuthMiddleware } from './combined-auth-middleware.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import { createFakeProjectStore } from '../../projects/infrastructure/fake-project-store.js';
import { createSessionService } from '../domain/session-service.js';
import { createTokenService } from '../domain/token-service.js';
import {
  acceptInvitationFailedError,
  createWorkspaceFailedError,
  issueOwnerInvitationFailedError,
} from '../domain/invitation-errors.js';
import { createFakePasswordHasher } from '@yoink/infrastructure';
import type { FastifyInstance } from 'fastify';

const PINO_ERROR_LEVEL = 50;
const UNKNOWN_ORG_ID = '550e8400-e29b-41d4-a716-446655440099';
const disabledRateLimit = {
  enabled: false,
  globalMax: 100,
  globalTimeWindow: '1 minute',
  ipMax: 2000,
  adminLoginMax: 5,
  adminLoginTimeWindow: '15 minutes',
  authLoginMax: 10,
  authLoginTimeWindow: '15 minutes',
  signupMax: 5,
  signupTimeWindow: '1 hour',
} as const;

type PinoLogLine = {
  level: number;
  msg?: string;
  error?: unknown;
};

describe('owner invite HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppFull();
  });

  const loginAdmin = async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const cookieValue = login.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE);
    expect(cookieValue?.value).toBeTruthy();
    return { [ADMIN_SESSION_COOKIE]: cookieValue?.value ?? '' };
  };

  const createHuman = async (cookies: Record<string, string>, email: string, name: string) => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${TEST_ORG_ID}/users`,
      cookies,
      payload: { email, name, role: 'member', kind: 'human' },
    });
    expect(created.statusCode).toBe(201);
    return created.json<{ id: string; email: string }>();
  };

  it('creates a workspace for an existing user and assigns owner', async () => {
    const cookies = await loginAdmin();
    const justin = await createHuman(cookies, 'justin@example.com', 'Justin');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: justin.email },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<{
      organization: { name: string };
      owner: { id: string; role?: string } | null;
      ownerInvitation: null;
    }>();
    expect(body.organization.name).toBe('Garden Club');
    expect(body.owner?.id).toBe(justin.id);
    expect(body.owner?.role).toBe('owner');
    expect(body.ownerInvitation).toBeNull();
  });

  it('creates a workspace for a new email with an owner invite', async () => {
    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'Libby@Example.com' },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<{
      owner: null;
      ownerInvitation: { email: string; code: string };
    }>();
    expect(body.owner).toBeNull();
    expect(body.ownerInvitation.email).toBe('libby@example.com');
    expect(body.ownerInvitation.code.length).toBeGreaterThanOrEqual(8);
  });

  it('returns a named validation error when ownerEmail is missing', async () => {
    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club' },
    });
    expect(created.statusCode).toBe(400);
    expect(created.json()).toMatchObject({
      message: OWNER_EMAIL_REQUIRED_MESSAGE,
      code: 'VALIDATION_FAILED',
    });
  });

  it('refuses a bot owner email', async () => {
    const cookies = await loginAdmin();
    const bot = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/550e8400-e29b-41d4-a716-446655440001/users`,
      cookies,
      payload: {
        email: 'lane@example.com',
        kind: 'agent',
        name: 'Lane',
      },
    });
    expect(bot.statusCode).toBe(201);
    const botEmail = bot.json<{ email: string }>().email;
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: botEmail },
    });
    expect(created.statusCode).toBe(400);
    expect(created.json()).toMatchObject({
      code: 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE',
      message: BOT_CANNOT_BE_OWNER_MESSAGE,
    });
  });

  it('issues a replacement owner invite and refuses the old code', async () => {
    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'libby@example.com' },
    });
    const { organization, ownerInvitation } = created.json<{
      organization: { id: string };
      ownerInvitation: { id: string; code: string; email: string };
    }>();
    const issued = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${organization.id}/owner-invitation`,
      cookies,
      payload: { email: 'libby@example.com' },
    });
    expect(issued.statusCode).toBe(201);
    const next = issued.json<{ ownerInvitation: { code: string } }>().ownerInvitation;
    expect(next.code).not.toBe(ownerInvitation.code);

    const oldCode = await app.inject({
      method: 'POST',
      url: '/api/invitations/validate',
      payload: { code: ownerInvitation.code },
    });
    expect(oldCode.statusCode).toBe(410);
    expect(oldCode.json()).toMatchObject({
      code: 'INVITATION_REPLACED',
      message: INVITATION_REPLACED_MESSAGE,
    });
  });

  it('returns the pending owner invitation', async () => {
    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'libby@example.com' },
    });
    const orgId = created.json<{ organization: { id: string } }>().organization.id;
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/admin/organizations/${orgId}/owner-invitation`,
      cookies,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().ownerInvitation.email).toBe('libby@example.com');
  });

  it('refuses owner invites on a workspace that already has an owner', async () => {
    const cookies = await loginAdmin();
    const justin = await createHuman(cookies, 'justin@example.com', 'Justin');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: justin.email },
    });
    const orgId = created.json<{ organization: { id: string } }>().organization.id;
    const issued = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${orgId}/owner-invitation`,
      cookies,
      payload: { email: 'libby@example.com' },
    });
    expect(issued.statusCode).toBe(409);
    expect(issued.json()).toMatchObject({
      code: 'WORKSPACE_ALREADY_HAS_OWNER',
      message: WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
    });
  });

  it('returns 404 for owner invitation on an unknown workspace', async () => {
    const cookies = await loginAdmin();
    const issued = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${UNKNOWN_ORG_ID}/owner-invitation`,
      cookies,
      payload: { email: 'libby@example.com' },
    });
    expect(issued.statusCode).toBe(404);
    expect(issued.json().code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('refuses in-app create with role owner', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/invitations',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: {
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'owner',
      },
    });
    expect(created.statusCode).toBe(400);
    expect(created.json().code).toBe('VALIDATION_FAILED');
  });

  it('hides owner invites from the in-app pending list and refuses revoke', async () => {
    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'libby@example.com' },
    });
    const orgId = created.json<{ organization: { id: string } }>().organization.id;
    const ownerInvite = created.json<{
      ownerInvitation: { id: string; code: string };
    }>().ownerInvitation;

    const memberInvite = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${orgId}/invitations`,
      cookies,
      payload: { role: 'admin' },
    });
    expect(memberInvite.statusCode).toBe(201);
    const memberCode = memberInvite.json<{ code: string }>().code;
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code: memberCode },
    });
    expect(accepted.statusCode).toBe(200);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/invitations`,
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
    });
    expect(listed.statusCode).toBe(200);
    const invitations = listed.json<{ invitations: Array<{ role: string }> }>().invitations;
    expect(invitations.every((invitation) => invitation.role !== 'owner')).toBe(true);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/invitations/${ownerInvite.id}`,
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
    });
    expect(revoked.statusCode).toBe(403);
    expect(revoked.json()).toMatchObject({
      code: 'OWNER_INVITATION_ADMIN_ONLY',
      message: OWNER_INVITE_ADMIN_ONLY_MESSAGE,
    });
  });

  it('returns the reworded invitation messages on validate and accept', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/invitations/validate',
      payload: { code: 'BADCODE1' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      code: 'INVITATION_NOT_FOUND',
      message: INVITATION_NOT_FOUND_MESSAGE,
    });

    const missingAccept = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code: 'BADCODE1' },
    });
    expect(missingAccept.statusCode).toBe(404);
    expect(missingAccept.json()).toMatchObject({
      code: 'INVITATION_NOT_FOUND',
      message: INVITATION_NOT_FOUND_MESSAGE,
    });

    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'libby@example.com' },
    });
    const ownerInvitation = created.json<{
      ownerInvitation: { code: string };
    }>().ownerInvitation;

    const wrongEmail = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code: ownerInvitation.code },
    });
    expect(wrongEmail.statusCode).toBe(400);
    expect(wrongEmail.json()).toMatchObject({
      code: 'INVITATION_EMAIL_MISMATCH',
      message: OWNER_INVITE_WRONG_EMAIL_MESSAGE,
    });
  });

  it('returns the reworded signup messages', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/signup/options',
      payload: { code: 'BADCODE1', email: 'libby@example.com' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      code: 'INVITATION_NOT_FOUND',
      message: INVITATION_NOT_FOUND_MESSAGE,
    });

    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'pending-signup@example.com' },
    });
    const orgId = created.json<{ organization: { id: string } }>().organization.id;
    const memberInvite = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${orgId}/invitations`,
      cookies,
      payload: { role: 'member' },
    });
    const code = memberInvite.json<{ code: string }>().code;
    const justin = await createHuman(cookies, 'justin@example.com', 'Justin');
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/signup/options',
      payload: { code, email: justin.email },
    });
    expect(registered.statusCode).toBe(409);
    expect(registered.json()).toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE,
    });
  });

  it('returns the reworded already-used messages on validate, accept, and signup', async () => {
    const cookies = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'pending-used@example.com' },
    });
    const orgId = created.json<{ organization: { id: string } }>().organization.id;
    const memberInvite = await app.inject({
      method: 'POST',
      url: `/api/admin/organizations/${orgId}/invitations`,
      cookies,
      payload: { role: 'member' },
    });
    const code = memberInvite.json<{ code: string }>().code;
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code },
    });
    expect(accepted.statusCode).toBe(200);

    const validated = await app.inject({
      method: 'POST',
      url: '/api/invitations/validate',
      payload: { code },
    });
    expect(validated.statusCode).toBe(410);
    expect(validated.json()).toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      message: INVITATION_ALREADY_USED_MESSAGE,
    });

    const acceptAgain = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code },
    });
    expect(acceptAgain.statusCode).toBe(410);
    expect(acceptAgain.json()).toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      message: INVITATION_ALREADY_USED_MESSAGE,
    });

    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup/options',
      payload: { code, email: 'new-person@example.com' },
    });
    expect(signup.statusCode).toBe(410);
    expect(signup.json()).toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      message: INVITATION_ALREADY_USED_MESSAGE,
    });
  });

  it('returns the reworded expired messages on validate, accept, and signup', async () => {
    const infrastructure = createInfrastructure(testConfigFull);
    await runMigrations(infrastructure.database, migrations);
    const timedApp = await bootstrapApp({
      config: testConfigFull,
      infrastructure,
      silent: true,
    });
    await infrastructure.database.execute({
      sql: `INSERT INTO user_sessions (id, user_id, current_organization_id, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        '2025-01-15T10:00:00.000Z',
        '2026-12-31T00:00:00.000Z',
        '2025-01-15T10:00:00.000Z',
      ],
    });

    const login = await timedApp.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    const cookies = {
      [ADMIN_SESSION_COOKIE]:
        login.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)?.value ?? '',
    };
    const created = await timedApp.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'pending-expired@example.com' },
    });
    const orgId = created.json<{ organization: { id: string } }>().organization.id;
    const memberInvite = await timedApp.inject({
      method: 'POST',
      url: `/api/admin/organizations/${orgId}/invitations`,
      cookies,
      payload: { role: 'member' },
    });
    const invitation = memberInvite.json<{ id: string; code: string }>();
    await infrastructure.database.execute({
      sql: `UPDATE invitations SET expires_at = ? WHERE id = ?`,
      args: ['2020-01-01T00:00:00.000Z', invitation.id],
    });

    const expected = {
      code: 'INVITATION_EXPIRED',
      message: INVITATION_EXPIRED_MESSAGE,
    };
    const validated = await timedApp.inject({
      method: 'POST',
      url: '/api/invitations/validate',
      payload: { code: invitation.code },
    });
    expect(validated.statusCode).toBe(410);
    expect(validated.json()).toMatchObject(expected);

    const accepted = await timedApp.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code: invitation.code },
    });
    expect(accepted.statusCode).toBe(410);
    expect(accepted.json()).toMatchObject(expected);

    const signup = await timedApp.inject({
      method: 'POST',
      url: '/api/auth/signup/options',
      payload: { code: invitation.code, email: 'new-person@example.com' },
    });
    expect(signup.statusCode).toBe(410);
    expect(signup.json()).toMatchObject(expected);
    await timedApp.close();
  });
});

describe('owner invite storage failures log the original cause', () => {
  const collectLogs = (): { logs: PinoLogLine[]; stream: Writable } => {
    const logs: PinoLogLine[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        const text = String(chunk);
        for (const part of text.split('\n')) {
          if (part.length === 0) {
            continue;
          }
          logs.push(JSON.parse(part) as PinoLogLine);
        }
        callback();
      },
    });
    return { logs, stream };
  };

  it('logs create-workspace storage failures', async () => {
    const { logs, stream } = collectLogs();
    const failingApp = Fastify({ logger: { level: 'error', stream } });
    await failingApp.register(cookie);
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();
    const adminSessionService = createAdminSessionService({
      adminPassword: TEST_ADMIN_PASSWORD,
      sessionSecret: 'test-session-secret-32-chars-min!',
      clock,
      idGenerator,
    });
    const organizationStore = createFakeOrganizationStore();
    const membershipStore = createFakeOrganizationMembershipStore();
    const userStore = createFakeUserStore();
    const invitationStore = createFakeInvitationStore();
    const adminService = createAdminService({
      organizationStore,
      organizationMembershipStore: membershipStore,
      userStore,
      invitationStore,
      tokenStore: createFakeTokenStore(),
      projectStore: createFakeProjectStore(),
      clock,
      idGenerator,
      passwordHasher: createFakePasswordHasher(),
    });
    const invitationService = createInvitationService({
      invitationStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
      codeGenerator: { generate: () => 'TESTCODE' },
    });
    await registerAdminRoutes(
      failingApp,
      {
        adminService,
        adminSessionService,
        invitationService,
        createWorkspace: () =>
          errAsync(createWorkspaceFailedError(new Error('disk full'))),
        issueOwnerInvitation: () =>
          errAsync(issueOwnerInvitationFailedError(new Error('disk full'))),
        getOwnerInvitation: () =>
          errAsync(issueOwnerInvitationFailedError(new Error('disk full'))),
        cookieConfig: { secure: false, sessionName: 'yoink_session', maxAge: 60 },
        clientIpOf: () => '127.0.0.1',
      },
      disabledRateLimit
    );
    await failingApp.ready();

    const login = await failingApp.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    const cookies = {
      [ADMIN_SESSION_COOKIE]:
        login.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)?.value ?? '',
    };
    const created = await failingApp.inject({
      method: 'POST',
      url: '/api/admin/organizations',
      cookies,
      payload: { name: 'Garden Club', ownerEmail: 'libby@example.com' },
    });
    expect(created.statusCode).toBe(500);
    expect(created.json().message).toBe(CREATE_WORKSPACE_STORAGE_MESSAGE);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: PINO_ERROR_LEVEL,
          error: expect.anything(),
        }),
      ])
    );

    const issued = await failingApp.inject({
      method: 'POST',
      url: `/api/admin/organizations/${UNKNOWN_ORG_ID}/owner-invitation`,
      cookies,
      payload: { email: 'libby@example.com' },
    });
    expect(issued.statusCode).toBe(500);
    expect(issued.json().message).toBe(CREATE_OWNER_INVITE_STORAGE_MESSAGE);
    await failingApp.close();
  });

  it('logs accept-invitation storage failures', async () => {
    const { logs, stream } = collectLogs();
    const failingApp = Fastify({ logger: { level: 'error', stream } });
    await failingApp.register(cookie);
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();
    const user = {
      id: TEST_USER_ID,
      email: 'seed@localhost',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const organization = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'My Captures',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const session = {
      id: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      currentOrganizationId: organization.id,
      createdAt: '2024-01-01T00:00:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastActiveAt: '2024-01-01T00:00:00.000Z',
    };
    const userStore = createFakeUserStore({ initialUsers: [user] });
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [organization],
    });
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [
        {
          id: '550e8400-e29b-41d4-a716-446655440020',
          userId: user.id,
          organizationId: organization.id,
          role: 'owner',
          isPersonalOrg: true,
          joinedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    const invitationStore = createFakeInvitationStore();
    const sessionStore = createFakeUserSessionStore({ initialSessions: [session] });
    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator,
    });
    const organizationService = createOrganizationService({
      organizationStore,
      clock,
      idGenerator,
    });
    const invitationService = createInvitationService({
      invitationStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
      codeGenerator: { generate: () => 'TESTCODE' },
    });
    const sessionService = createSessionService({
      sessionStore,
      userService,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
    });
    const tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore: createFakeTokenStore(),
      passwordHasher: createFakePasswordHasher(),
      clock,
    });
    await registerInvitationRoutes(failingApp, {
      invitationService,
      membershipService,
      organizationService,
      userService,
      acceptInvitation: () =>
        errAsync(acceptInvitationFailedError(new Error('disk full'))),
      authMiddleware: createCombinedAuthMiddleware({
        sessionService,
        tokenService,
        sessionCookieName: TEST_SESSION_COOKIE,
      }),
    });
    await failingApp.ready();

    const accepted = await failingApp.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { code: 'ABCD1234' },
    });
    expect(accepted.statusCode).toBe(500);
    expect(accepted.json().message).toBe(ACCEPT_INVITE_STORAGE_MESSAGE);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: PINO_ERROR_LEVEL,
          error: expect.anything(),
        }),
      ])
    );
    await failingApp.close();
  });
});
