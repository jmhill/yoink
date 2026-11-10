import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { registerPasskeyRoutes } from './passkey-routes.js';
import { createPasskeyService } from '../../../access/application/handle-passkey.js';
import { createChallengeManager } from '../../../access/domain/challenge.js';
import { createFakeWebAuthnVerifier } from '../../../access/infrastructure/fake-webauthn-verifier.js';
import { createSessionService } from '../../../access/domain/session-service.js';
import { createUserService } from '../../../access/domain/user-service.js';
import { createMembershipService } from '../../../access/application/handle-membership.js';
import { createFakeUserStore } from '../../../access/infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../../../access/infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../../../access/infrastructure/fake-organization-membership-store.js';
import { createFakePasskeyCredentialStore } from '../../../access/infrastructure/fake-passkey-credential-store.js';
import { createFakeUserSessionStore } from '../../../access/infrastructure/fake-user-session-store.js';
import type { User } from '../../../access/domain/user.js';
import type { Organization } from '../../../access/domain/organization.js';
import type { OrganizationMembership } from '../../../access/domain/organization-membership.js';
import type { UserSession } from '../../../access/domain/user-session.js';
import type { PasskeyCredential } from '../../../access/domain/passkey-credential.js';
import {
  createFakeClock,
  createFakeIdGenerator,
} from '@yoink/infrastructure';

const USER_SESSION_COOKIE = 'user_session';
const CHALLENGE_SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hmac';

describe('passkey routes', () => {
  let app: FastifyInstance;
  let clock: ReturnType<typeof createFakeClock>;
  let credentialStore: ReturnType<typeof createFakePasskeyCredentialStore>;
  let sessionStore: ReturnType<typeof createFakeUserSessionStore>;
  let verifier: ReturnType<typeof createFakeWebAuthnVerifier>;

  const testOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    email: 'test@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    userId: testUser.id,
    organizationId: testOrg.id,
    role: 'admin',
    isPersonalOrg: true,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const testSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440004',
    userId: testUser.id,
    currentOrganizationId: testOrg.id,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-12-31T00:00:00.000Z',
    lastActiveAt: '2024-06-15T12:00:00.000Z',
  };

  const testCredential: PasskeyCredential = {
    id: 'test-credential-id',
    userId: testUser.id,
    publicKey: 'test-public-key',
    counter: 0,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
    name: 'Test Passkey',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    verifier = createFakeWebAuthnVerifier();
    const idGenerator = createFakeIdGenerator();

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });
    const userStore = createFakeUserStore({
      initialUsers: [testUser],
    });
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [testMembership],
    });
    credentialStore = createFakePasskeyCredentialStore();
    sessionStore = createFakeUserSessionStore({
      initialSessions: [testSession],
    });

    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator,
    });

    const passkeyService = createPasskeyService({
      credentialStore,
      userService,
      clock,
      verifier,
      challenges: createChallengeManager({ secret: CHALLENGE_SECRET, clock }),
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

    app = Fastify();
    await app.register(cookie);

    await registerPasskeyRoutes(app, {
      passkeyService,
      sessionService,
      sessionCookieName: USER_SESSION_COOKIE,
      cookieOptions: {
        httpOnly: true,
        secure: false, // Allow http in tests
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      },
    });

    await app.ready();
  });

  describe('POST /api/auth/passkey/register/options', () => {
    it('returns registration options for authenticated user', async () => {
      const mockOptions = {
        challenge: 'test-challenge',
        rp: { name: 'Test App', id: 'localhost' },
        user: { id: 'user-id', name: 'test@example.com', displayName: 'test@example.com' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      };

      verifier.setRegistrationOptions(mockOptions);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/options',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.options).toEqual(mockOptions);
      expect(body.challenge).toBeDefined();
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/options',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/passkey/register/verify', () => {
    it('registers passkey and creates session on success', async () => {
      // Generate options first to get a valid challenge
      const mockOptions = { challenge: 'test-challenge' };
      verifier.setRegistrationOptions(mockOptions);

      const optionsResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/options',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: {},
      });
      const { challenge } = optionsResponse.json();

      // Mock successful verification
      verifier.setRegistrationVerification({
        verified: true,
        id: 'new-credential-id',
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 0,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/verify',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: {
          challenge,
          credential: {
            id: 'new-credential-id',
            rawId: 'new-credential-id',
            response: {
              clientDataJSON: 'base64',
              attestationObject: 'base64',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
          credentialName: 'My MacBook',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.credential.id).toBe('new-credential-id');
      expect(body.credential.name).toBe('My MacBook');

      // Check session cookie was set
      const cookies = response.cookies;
      const sessionCookie = cookies.find((c: { name: string }) => c.name === USER_SESSION_COOKIE);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
    });

    it('returns 410 for expired challenge', async () => {
      // Generate options
      verifier.setRegistrationOptions({ challenge: 'test' });
      const optionsResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/options',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: {},
      });
      const { challenge } = optionsResponse.json();

      // Advance clock past challenge expiry
      clock.advanceBy(6 * 60 * 1000); // 6 minutes

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/verify',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: {
          challenge,
          credential: {},
        },
      });

      expect(response.statusCode).toBe(410);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/passkey/register/verify',
        payload: {
          challenge: 'test',
          credential: {},
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/passkey/credentials', () => {
    it('returns list of credentials for authenticated user', async () => {
      await credentialStore.save(testCredential);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/passkey/credentials',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.credentials).toHaveLength(1);
      expect(body.credentials[0].id).toBe(testCredential.id);
      expect(body.credentials[0].name).toBe(testCredential.name);
      // Should not include sensitive data
      expect(body.credentials[0].publicKey).toBeUndefined();
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/passkey/credentials',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/auth/passkey/credentials/:credentialId', () => {
    it('deletes credential when user has multiple passkeys', async () => {
      await credentialStore.save(testCredential);
      await credentialStore.save({
        ...testCredential,
        id: 'second-credential-id',
        name: 'Second Passkey',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/auth/passkey/credentials/${testCredential.id}`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().message).toBe('Passkey deleted');
    });

    it('returns 409 when trying to delete last passkey', async () => {
      await credentialStore.save(testCredential);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/auth/passkey/credentials/${testCredential.id}`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('last passkey');
    });

    it('returns 404 for non-existent credential', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/passkey/credentials/non-existent',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when user does not own credential', async () => {
      await credentialStore.save({
        ...testCredential,
        userId: 'other-user-id',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/auth/passkey/credentials/${testCredential.id}`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/auth/passkey/credentials/${testCredential.id}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
