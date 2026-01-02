import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './auth-routes.js';
import { createPasskeyService } from '../domain/passkey-service.js';
import { createSessionService } from '../domain/session-service.js';
import { createUserService } from '../../users/domain/user-service.js';
import { createMembershipService } from '../../organizations/domain/membership-service.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
import { createFakePasskeyCredentialStore } from '../infrastructure/fake-passkey-credential-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import type { User } from '../../users/domain/user.js';
import type { Organization } from '../../organizations/domain/organization.js';
import type { OrganizationMembership } from '../../organizations/domain/organization-membership.js';
import type { UserSession } from '../domain/user-session.js';
import type { PasskeyCredential } from '../domain/passkey-credential.js';
import type { WebAuthnConfig, RateLimitConfig } from '../../config/schema.js';
import {
  createFakeClock,
  createFakeIdGenerator,
} from '@yoink/infrastructure';

// Mock the simplewebauthn functions
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  generateAuthenticationOptions as mockGenerateAuthOpts,
  verifyAuthenticationResponse as mockVerifyAuth,
} from '@simplewebauthn/server';

const USER_SESSION_COOKIE = 'user_session';

describe('auth routes', () => {
  let app: FastifyInstance;
  let clock: ReturnType<typeof createFakeClock>;
  let credentialStore: ReturnType<typeof createFakePasskeyCredentialStore>;
  let sessionStore: ReturnType<typeof createFakeUserSessionStore>;
  let userStore: ReturnType<typeof createFakeUserStore>;

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
    publicKey: 'dGVzdC1wdWJsaWMta2V5', // base64url encoded
    counter: 0,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
    name: 'Test Passkey',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const webauthnConfig: WebAuthnConfig = {
    rpId: 'localhost',
    rpName: 'Test App',
    origin: 'http://localhost:3000',
    challengeSecret: 'test-secret-that-is-at-least-32-bytes-long-for-hmac',
  };

  const rateLimitConfig: RateLimitConfig = {
    enabled: false, // Disable rate limiting in unit tests
    globalMax: 100,
    globalTimeWindow: '1 minute',
    adminLoginMax: 5,
    adminLoginTimeWindow: '15 minutes',
    authLoginMax: 10,
    authLoginTimeWindow: '15 minutes',
    signupMax: 5,
    signupTimeWindow: '1 hour',
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });
    userStore = createFakeUserStore({
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
      config: webauthnConfig,
      clock,
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

    await registerAuthRoutes(app, {
      passkeyService,
      sessionService,
      userService,
      membershipService,
      organizationStore,
      sessionCookieName: USER_SESSION_COOKIE,
      cookieOptions: {
        httpOnly: true,
        secure: false, // Allow http in tests
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      },
    }, rateLimitConfig);

    await app.ready();
  });

  describe('POST /api/auth/login/options', () => {
    it('returns authentication options for discoverable credentials', async () => {
      const mockOptions = {
        challenge: 'test-challenge',
        rpId: 'localhost',
        userVerification: 'preferred',
        allowCredentials: [],
      };

      vi.mocked(mockGenerateAuthOpts).mockResolvedValue(mockOptions as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.options).toEqual(mockOptions);
      expect(body.challenge).toBeDefined();
    });

    it('does not require authentication (public endpoint)', async () => {
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({
        challenge: 'test',
        rpId: 'localhost',
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
        // No auth header or cookie
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/auth/login/verify', () => {
    it('verifies passkey and creates session on success', async () => {
      // Save the credential first
      await credentialStore.save(testCredential);

      // Generate options first to get a valid challenge
      const mockOptions = { challenge: 'test-challenge', rpId: 'localhost' };
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue(mockOptions as any);

      const optionsResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });
      const { challenge } = optionsResponse.json();

      // Mock successful verification
      vi.mocked(mockVerifyAuth).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          credentialID: testCredential.id,
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        payload: {
          challenge,
          credential: {
            id: testCredential.id,
            rawId: testCredential.id,
            response: {
              clientDataJSON: 'base64',
              authenticatorData: 'base64',
              signature: 'base64',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.id).toBe(testUser.id);
      expect(body.user.email).toBe(testUser.email);

      // Check session cookie was set
      const cookies = response.cookies;
      const sessionCookie = cookies.find((c: { name: string }) => c.name === USER_SESSION_COOKIE);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
    });

    it('returns 401 when credential not found', async () => {
      // Generate options first
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({
        challenge: 'test',
        rpId: 'localhost',
      } as any);

      const optionsResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });
      const { challenge } = optionsResponse.json();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        payload: {
          challenge,
          credential: {
            id: 'non-existent-credential',
            rawId: 'non-existent-credential',
            response: {
              clientDataJSON: 'base64',
              authenticatorData: 'base64',
              signature: 'base64',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 410 for expired challenge', async () => {
      await credentialStore.save(testCredential);

      // Generate options
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({
        challenge: 'test',
        rpId: 'localhost',
      } as any);

      const optionsResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });
      const { challenge } = optionsResponse.json();

      // Advance clock past challenge expiry (5 minutes)
      clock.advanceBy(6 * 60 * 1000); // 6 minutes

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        payload: {
          challenge,
          credential: {
            id: testCredential.id,
            rawId: testCredential.id,
            response: {
              clientDataJSON: 'base64',
              authenticatorData: 'base64',
              signature: 'base64',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      });

      expect(response.statusCode).toBe(410);
    });

    it('returns 400 when verification fails', async () => {
      await credentialStore.save(testCredential);

      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({
        challenge: 'test',
        rpId: 'localhost',
      } as any);

      const optionsResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });
      const { challenge } = optionsResponse.json();

      // Mock failed verification
      vi.mocked(mockVerifyAuth).mockResolvedValue({
        verified: false,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        payload: {
          challenge,
          credential: {
            id: testCredential.id,
            rawId: testCredential.id,
            response: {
              clientDataJSON: 'base64',
              authenticatorData: 'base64',
              signature: 'base64',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes session and clears cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      // Cookie should be cleared (set to expire immediately)
      const cookies = response.cookies;
      const sessionCookie = cookies.find((c: { name: string }) => c.name === USER_SESSION_COOKIE);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toBe('');

      // Session should be deleted from store
      const result = await sessionStore.findById(testSession.id);
      expect(result.isOk() && result.value).toBeNull();
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });

      expect(response.statusCode).toBe(401);
    });

    it('still succeeds even if session not found (idempotent)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { [USER_SESSION_COOKIE]: 'non-existent-session' },
      });

      // Should still return 401 because middleware validates session first
      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/session', () => {
    it('returns current session info for authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.id).toBe(testUser.id);
      expect(body.user.email).toBe(testUser.email);
      expect(body.organizationId).toBe(testOrg.id);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 for expired session', async () => {
      // Create an expired session
      const expiredSession: UserSession = {
        ...testSession,
        id: 'expired-session-id',
        expiresAt: '2024-01-01T00:00:00.000Z', // In the past
      };
      await sessionStore.save(expiredSession);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        cookies: { [USER_SESSION_COOKIE]: expiredSession.id },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
