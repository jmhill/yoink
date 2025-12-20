import { describeFeature, expect, beforeAll, afterAll } from './harness.js';
import { UnauthorizedError } from '../dsl/index.js';
import { createHttpActor } from '../drivers/http/actor.js';
import { createHttpClient } from '../drivers/http/http-client.js';
import { getTestConfig } from '../config.js';

/**
 * Tests for API token security.
 * Verifies that revoked tokens are properly rejected.
 */
describeFeature(
  'Token security',
  ['http'],
  ({ admin, it }) => {
    const config = getTestConfig();
    const client = createHttpClient(config.baseUrl);

    beforeAll(async () => {
      await admin.login();
    });

    afterAll(async () => {
      await admin.logout();
    });

    it('rejects requests with revoked tokens', async () => {
      // Setup: Create org, user, and token
      const org = await admin.createOrganization(`revoke-test-${Date.now()}`);
      const user = await admin.createUser(org.id, `revoke-user-${Date.now()}@example.com`);
      const { rawToken, token } = await admin.createToken(user.id, 'to-be-revoked');

      // Create actor with the token
      const actor = createHttpActor(client, {
        email: user.email,
        userId: user.id,
        organizationId: org.id,
        token: rawToken,
      });

      // Verify token works initially
      const capture = await actor.createCapture({ content: 'test capture' });
      expect(capture.content).toBe('test capture');

      // Revoke the token
      await admin.revokeToken(token.id);

      // Verify token no longer works
      await expect(actor.createCapture({ content: 'should fail' })).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('rejects requests with invalid token format', async () => {
      const invalidActor = createHttpActor(client, {
        email: 'fake@example.com',
        userId: 'fake-user-id',
        organizationId: 'fake-org-id',
        token: 'not-a-valid-token',
      });

      await expect(invalidActor.listCaptures()).rejects.toThrow(UnauthorizedError);
    });

    it('rejects requests with non-existent token id', async () => {
      const fakeActor = createHttpActor(client, {
        email: 'fake@example.com',
        userId: 'fake-user-id',
        organizationId: 'fake-org-id',
        token: '00000000-0000-0000-0000-000000000000:fakesecret',
      });

      await expect(fakeActor.listCaptures()).rejects.toThrow(UnauthorizedError);
    });
  }
);
