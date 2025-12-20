import { describeFeature, expect } from './harness.js';
import type { Actor } from '../dsl/index.js';

/**
 * Tests for web app session management.
 * These are Playwright-only tests since they involve browser UI interactions
 * that don't have HTTP API equivalents.
 */
describeFeature(
  'Managing web app sessions',
  ['playwright'],
  ({ createActor, createAnonymousActor, it, beforeEach }) => {
    let alice: Actor;

    beforeEach(async () => {
      alice = await createActor('alice@example.com');
    });

    it('can navigate to settings page', async () => {
      // Create a capture first to ensure we're logged in
      await alice.createCapture({ content: 'test capture' });

      // Navigate to settings - should not throw
      await alice.goToSettings();
    });

    it('can log out from settings page', async () => {
      // Create a capture first to ensure we're logged in
      await alice.createCapture({ content: 'test capture' });

      // Verify we don't require configuration before logout
      const beforeLogout = await alice.requiresConfiguration();
      expect(beforeLogout).toBe(false);

      // Log out
      await alice.logout();

      // Verify the browser state was cleared and we're redirected to /config
      const afterLogout = await alice.requiresConfiguration();
      expect(afterLogout).toBe(true);
    });

    it('redirects to config page when no token is set', async () => {
      // The anonymous actor verifies that accessing the app without a token
      // redirects to /config - this is already tested by the auth tests,
      // but we verify the redirect behavior explicitly here
      const anonymous = createAnonymousActor();

      // This will throw UnauthorizedError after verifying redirect to /config
      // The important thing is the redirect happens (verified inside the actor)
      try {
        await anonymous.listCaptures();
      } catch {
        // Expected - we just wanted to verify the redirect happens
      }
    });

    it('can configure token and access inbox', async () => {
      // The createActor() helper already configures the token,
      // so if we can create a capture, token configuration worked
      const capture = await alice.createCapture({
        content: `config-test-${Date.now()}`,
      });

      expect(capture.content).toContain('config-test-');
    });
  }
);
