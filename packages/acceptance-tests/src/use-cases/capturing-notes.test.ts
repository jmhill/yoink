import { describeFeature, it, expect, beforeEach } from './harness.js';
import type { Actor, AnonymousActor } from '../dsl/index.js';
import { UnauthorizedError, ValidationError } from '../dsl/index.js';

describeFeature(
  'Capturing notes',
  ['http', 'playwright'],
  ({ createActor, createAnonymousActor }) => {
    let alice: Actor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await createActor('alice@example.com');
      anonymous = createAnonymousActor();
    });

    it('can create a new capture', async () => {
      const capture = await alice.createCapture({
        content: 'Remember to buy milk',
      });

      expect(capture.content).toBe('Remember to buy milk');
      expect(capture.status).toBe('inbox');
      expect(capture.createdById).toBe(alice.userId);
      expect(capture.organizationId).toBe(alice.organizationId);
      expect(capture.id).toBeDefined();
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

      expect(captures).toContainEqual(expect.objectContaining({ id: capture.id }));
    });

    it('orders captures newest first', async () => {
      const first = await alice.createCapture({ content: 'first' });
      const second = await alice.createCapture({ content: 'second' });

      const captures = await alice.listCaptures();
      const firstIndex = captures.findIndex((c) => c.id === first.id);
      const secondIndex = captures.findIndex((c) => c.id === second.id);

      expect(secondIndex).toBeLessThan(firstIndex);
    });

    it('requires authentication to list captures', async () => {
      await expect(anonymous.listCaptures()).rejects.toThrow(UnauthorizedError);
    });

    it('can retrieve a specific capture by id', async () => {
      const created = await alice.createCapture({ content: 'Find me later' });

      const retrieved = await alice.getCapture(created.id);

      expect(retrieved.content).toBe('Find me later');
      expect(retrieved.id).toBe(created.id);
    });

    it('requires authentication to get a capture', async () => {
      await expect(
        anonymous.getCapture('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(UnauthorizedError);
    });
  }
);
