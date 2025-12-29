import type { Driver, DriverConfig } from '../types.js';
import type { Actor, AnonymousActor } from '../../dsl/index.js';
import { createHttpClient } from '../http/http-client.js';
import { createHttpAdmin } from '../http/admin.js';
import { createHttpHealth } from '../http/health.js';
import { createHttpSessionActor, createHttpSessionAnonymousActor } from './actor.js';

/**
 * Creates an HTTP driver that uses session-based authentication.
 * 
 * This driver:
 * - Creates organizations and invitations via the admin API
 * - Signs up users via the signup API (simulating the passkey flow with mocked WebAuthn)
 * - Uses session cookies for actor requests
 * 
 * This tests the session-based auth path used by the web app.
 */
export const createHttpSessionDriver = (config: DriverConfig): Driver => {
  const client = createHttpClient(config.baseUrl);
  const admin = createHttpAdmin(client, config.adminPassword);
  const health = createHttpHealth(client);

  return {
    name: 'http-session',
    capabilities: ['http'],

    admin,
    health,

    async createActor(email: string): Promise<Actor> {
      // Create an isolated tenant for this actor
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const orgName = `test-org-${suffix}`;
      // Make email unique per actor to satisfy the global email uniqueness constraint
      const [localPart, domain] = email.split('@');
      const uniqueEmail = `${localPart}+${suffix}@${domain}`;

      await admin.login();
      try {
        // Create org and invitation (no user/token needed - signup will create user)
        const org = await admin.createOrganization(orgName);
        const invitation = await admin.createInvitation(org.id, { role: 'admin' });

        // Create a fresh HTTP client for this actor (isolated cookie jar)
        const actorClient = createHttpClient(config.baseUrl);

        // Sign up the user via the signup flow
        // This creates the user, personal org, and establishes a session
        const signupResult = await signupWithMockedPasskey(actorClient, {
          code: invitation.code,
          email: uniqueEmail,
        });

        return createHttpSessionActor(actorClient, {
          email: uniqueEmail,
          userId: signupResult.userId,
          organizationId: org.id, // The org they were invited to
        });
      } finally {
        await admin.logout();
      }
    },

    createAnonymousActor(): AnonymousActor {
      // Create a fresh HTTP client (no session)
      const anonClient = createHttpClient(config.baseUrl);
      return createHttpSessionAnonymousActor(anonClient);
    },

    async setup(): Promise<void> {
      // Verify connectivity
      await health.check();
    },

    async teardown(): Promise<void> {
      // No cleanup needed - each test uses isolated tenants
    },
  };
};

/**
 * Performs the signup flow with a mocked WebAuthn response.
 * 
 * This simulates what the browser does during signup:
 * 1. POST /api/auth/signup/options - Get WebAuthn registration options
 * 2. POST /api/auth/signup/verify - Complete registration with mocked credential
 * 
 * The server doesn't actually verify the WebAuthn response cryptographically in tests
 * when we provide a properly structured mock response.
 */
type SignupInput = {
  code: string;
  email: string;
};

type SignupResult = {
  userId: string;
  personalOrgId: string;
  invitedOrgId: string;
};

const signupWithMockedPasskey = async (
  client: ReturnType<typeof createHttpClient>,
  input: SignupInput
): Promise<SignupResult> => {
  // Step 1: Get signup options
  const optionsResponse = await client.post('/api/auth/signup/options', {
    code: input.code,
    email: input.email,
  });

  if (optionsResponse.statusCode !== 200) {
    throw new Error(`Failed to get signup options: ${optionsResponse.body}`);
  }

  const optionsData = optionsResponse.json<{
    options: unknown;
    challenge: string;
    organizationId: string;
    organizationName: string;
    role: string;
  }>();

  // Step 2: Create a mock WebAuthn registration response
  // This is a valid structure that the server will accept
  // The actual cryptographic verification is bypassed in test environments
  const mockCredential = createMockRegistrationResponse();

  // Step 3: Complete signup
  const verifyResponse = await client.post('/api/auth/signup/verify', {
    challenge: optionsData.challenge,
    code: input.code,
    email: input.email,
    credential: mockCredential,
    credentialName: 'Test Device',
  });

  if (verifyResponse.statusCode !== 201) {
    throw new Error(`Failed to complete signup: ${verifyResponse.body}`);
  }

  const verifyData = verifyResponse.json<{
    user: { id: string; email: string };
    personalOrganization: { id: string; name: string };
    invitedOrganization: { id: string; name: string; role: string };
  }>();

  // The session cookie is automatically stored in the client's cookie jar
  return {
    userId: verifyData.user.id,
    personalOrgId: verifyData.personalOrganization.id,
    invitedOrgId: verifyData.invitedOrganization.id,
  };
};

/**
 * Encodes a Uint8Array to base64url string.
 */
const toBase64Url = (bytes: Uint8Array): string => {
  // Convert to base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  // Convert to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Creates a mock WebAuthn registration response.
 * 
 * This is structured to match RegistrationResponseJSON from @simplewebauthn/browser.
 * The values are base64url-encoded mock data that will pass structural validation.
 */
const createMockRegistrationResponse = () => {
  // Generate random bytes for IDs (base64url encoded)
  const randomBytes = (length: number): string => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
  };

  // Encode string to base64url
  const stringToBase64Url = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    return toBase64Url(bytes);
  };

  return {
    id: randomBytes(32),
    rawId: randomBytes(32),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: stringToBase64Url(JSON.stringify({
        type: 'webauthn.create',
        challenge: randomBytes(32),
        origin: 'http://localhost:3333',
        crossOrigin: false,
      })),
      attestationObject: randomBytes(128), // Mock attestation
      transports: ['internal'],
      publicKeyAlgorithm: -7, // ES256
      publicKey: randomBytes(65), // Mock public key
      authenticatorData: randomBytes(37), // Mock authenticator data
    },
  };
};
