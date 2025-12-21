import { usingDrivers, describe, it, expect, beforeEach } from './harness.js';
import type { CoreActor } from '../dsl/index.js';
import { NotFoundError } from '../dsl/index.js';

/**
 * Tests for multi-tenant isolation.
 * Verifies that users in different organizations cannot access each other's data.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Tenant isolation [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let bob: CoreActor;

    beforeEach(async () => {
      // Create two actors in different organizations
      alice = await ctx.createActor('alice@example.com');
      bob = await ctx.createActor('bob@example.com');
    });

    it('users cannot see captures from other organizations', async () => {
      const aliceCapture = await alice.createCapture({
        content: `alice-private-${Date.now()}`,
      });

      const bobCaptures = await bob.listCaptures();

      expect(bobCaptures.some((c) => c.id === aliceCapture.id)).toBe(false);
      expect(bobCaptures.some((c) => c.content === aliceCapture.content)).toBe(false);
    });

    it('users cannot access specific captures from other organizations', async () => {
      const aliceCapture = await alice.createCapture({
        content: 'alice-secret-note',
      });

      await expect(bob.getCapture(aliceCapture.id)).rejects.toThrow(NotFoundError);
    });

    it('users cannot update captures from other organizations', async () => {
      const aliceCapture = await alice.createCapture({
        content: 'alice-original',
      });

      await expect(
        bob.updateCapture(aliceCapture.id, { content: 'bob-was-here' })
      ).rejects.toThrow(NotFoundError);

      // Verify alice's capture is unchanged
      const unchanged = await alice.getCapture(aliceCapture.id);
      expect(unchanged.content).toBe('alice-original');
    });

    it('users cannot archive captures from other organizations', async () => {
      const aliceCapture = await alice.createCapture({
        content: 'alice-inbox-item',
      });

      await expect(bob.archiveCapture(aliceCapture.id)).rejects.toThrow(NotFoundError);

      // Verify alice's capture is still in inbox
      const unchanged = await alice.getCapture(aliceCapture.id);
      expect(unchanged.status).toBe('inbox');
    });

    it('each user sees only their own captures in lists', async () => {
      await alice.createCapture({ content: `alice-note-${Date.now()}` });
      await alice.createCapture({ content: `alice-task-${Date.now()}` });
      await bob.createCapture({ content: `bob-note-${Date.now()}` });

      const aliceCaptures = await alice.listCaptures();
      const bobCaptures = await bob.listCaptures();

      // Alice should see exactly 2 captures
      expect(aliceCaptures.length).toBe(2);
      expect(aliceCaptures.every((c) => c.organizationId === alice.organizationId)).toBe(true);

      // Bob should see exactly 1 capture
      expect(bobCaptures.length).toBe(1);
      expect(bobCaptures.every((c) => c.organizationId === bob.organizationId)).toBe(true);
    });
  });
});
