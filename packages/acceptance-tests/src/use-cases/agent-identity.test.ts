import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor } from '@yoink/acceptance-testing';
import { ForbiddenError, TokenLimitReachedError } from '@yoink/acceptance-testing';

/**
 * Identity slice: token-only agent principals sit on the task board.
 *
 * Product rules:
 * - Agents are org members but cannot passkey
 * - Owner/admin mints an agent and receives its token once (not from the human 2-token bucket)
 * - Agents can CRUD/complete/pin/delete tasks, including assignee
 * - Agents cannot create captures
 * - Any principal may assign a task to any other principal in the org
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Agent identity [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-agent@example.com');
    });

    it('owner can mint an agent and receive its token once', async () => {
      const minted = await alice.mintAgent('Vault bot');

      expect(minted.agent.name).toBe('Vault bot');
      expect(minted.agent.kind).toBe('agent');
      expect(minted.agent.userId).toBeDefined();
      expect(minted.rawToken).toMatch(/^[^:]+:[^:]+$/);

      const aliceTokens = await alice.listTokens();
      expect(aliceTokens.map((t) => t.id)).not.toContain(minted.token.id);
    });

    it('agent token can create, list, get, update, complete, pin, and delete tasks', async () => {
      const minted = await alice.mintAgent('Task bot');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const created = await bot.createTask({ title: 'Triage inbox' });
      expect(created.title).toBe('Triage inbox');
      expect(created.createdById).toBe(minted.agent.userId);

      const listed = await bot.listTasks('all');
      expect(listed.some((t) => t.id === created.id)).toBe(true);

      const fetched = await bot.getTask(created.id);
      expect(fetched.title).toBe('Triage inbox');

      const updated = await bot.updateTask(created.id, { title: 'Triage inbox now' });
      expect(updated.title).toBe('Triage inbox now');

      const pinned = await bot.pinTask(created.id);
      expect(pinned.pinnedAt).toBeDefined();

      const completed = await bot.completeTask(created.id);
      expect(completed.completedAt).toBeDefined();

      await bot.deleteTask(created.id);
    });

    it('agent token cannot create captures', async () => {
      const minted = await alice.mintAgent('Capture-blocked bot');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      await expect(bot.createCapture({ content: 'should not land' })).rejects.toThrow(
        ForbiddenError
      );
    });

    it('can assign a task to an agent and to a human', async () => {
      const minted = await alice.mintAgent('Assignee bot');

      const toAgent = await alice.createTask({
        title: 'For the bot',
        assigneeId: minted.agent.userId,
      });
      expect(toAgent.assigneeId).toBe(minted.agent.userId);

      const toHuman = await alice.createTask({ title: 'For Alice' });
      const assigned = await alice.updateTask(toHuman.id, { assigneeId: alice.userId });
      expect(assigned.assigneeId).toBe(alice.userId);

      const cleared = await alice.updateTask(toHuman.id, { assigneeId: null });
      expect(cleared.assigneeId).toBeUndefined();
    });

    it('minting an agent does not consume the human token bucket', async () => {
      await alice.createToken('CLI token');
      await expect(alice.createToken('One too many')).rejects.toThrow(TokenLimitReachedError);

      const minted = await alice.mintAgent('Extra bot');
      expect(minted.rawToken).toMatch(/^[^:]+:[^:]+$/);

      const aliceTokens = await alice.listTokens();
      expect(aliceTokens).toHaveLength(2);
    });
  });
});
