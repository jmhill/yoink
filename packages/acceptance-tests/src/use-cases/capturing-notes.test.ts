import { usingDrivers, describe, it, expect, beforeEach } from './harness.js';
import type { CoreActor, AnonymousActor } from '../dsl/index.js';
import { UnauthorizedError, ValidationError } from '../dsl/index.js';

usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Capturing notes [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('can create a new capture', async () => {
      const capture = await alice.createCapture({
        content: 'Remember to buy milk',
      });

      expect(capture.content).toBe('Remember to buy milk');
      expect(capture.status).toBe('inbox');
      expect(capture.id).toBeDefined();
    });

    it('requires authentication to create captures', async () => {
      await expect(
        anonymous.createCapture({ content: 'test' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects empty content', async () => {
      await expect(alice.createCapture({ content: '' })).rejects.toThrow(
        ValidationError
      );
    });

    it('shows new captures in the list', async () => {
      const capture = await alice.createCapture({
        content: `unique-${Date.now()}`,
      });

      const captures = await alice.listCaptures();

      expect(captures.some((c) => c.content === capture.content)).toBe(true);
    });

    it('orders captures newest first', async () => {
      await alice.createCapture({ content: 'first-note' });
      await alice.createCapture({ content: 'second-note' });

      const captures = await alice.listCaptures();
      const firstIndex = captures.findIndex((c) => c.content === 'first-note');
      const secondIndex = captures.findIndex((c) => c.content === 'second-note');

      expect(secondIndex).toBeLessThan(firstIndex);
    });

    it('can retrieve a specific capture by id', async () => {
      const created = await alice.createCapture({ content: 'Find me later' });

      const retrieved = await alice.getCapture(created.id);

      expect(retrieved.content).toBe('Find me later');
    });
  });
});

// API-specific tests (require features not in web UI)
usingDrivers(['http'] as const, (ctx) => {
  describe(`Capturing notes - API features [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('includes user and org info in capture', async () => {
      const capture = await alice.createCapture({
        content: 'Test capture',
      });

      expect(capture.createdById).toBe(alice.userId);
      expect(capture.organizationId).toBe(alice.organizationId);
      expect(capture.capturedAt).toBeDefined();
    });

    it('can create a capture with optional metadata', async () => {
      const capture = await alice.createCapture({
        content: 'Interesting article',
        title: 'How to TDD',
        sourceUrl: 'https://example.com/tdd',
        sourceApp: 'browser-extension',
      });

      expect(capture.title).toBe('How to TDD');
      expect(capture.sourceUrl).toBe('https://example.com/tdd');
      expect(capture.sourceApp).toBe('browser-extension');
    });

    it('requires authentication to list captures', async () => {
      await expect(anonymous.listCaptures()).rejects.toThrow(UnauthorizedError);
    });

    it('requires authentication to get a capture', async () => {
      await expect(
        anonymous.getCapture('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(UnauthorizedError);
    });

    it('can retrieve capture by exact id', async () => {
      const created = await alice.createCapture({ content: 'Find me later' });

      const retrieved = await alice.getCapture(created.id);

      expect(retrieved.id).toBe(created.id);
    });
  });
});
