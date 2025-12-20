import { describeFeature, it, expect, beforeEach } from './harness.js';
import type { Actor } from '../dsl/index.js';
import { NotFoundError, ValidationError } from '../dsl/index.js';

describeFeature('Organizing work', ['http', 'playwright'], ({ createActor }) => {
  let alice: Actor;

  beforeEach(async () => {
    alice = await createActor('alice@example.com');
  });

  it('can archive a capture', async () => {
    const capture = await alice.createCapture({ content: 'Done with this' });

    const archived = await alice.archiveCapture(capture.id);

    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeDefined();
  });

  it('can unarchive a capture', async () => {
    const capture = await alice.createCapture({ content: 'Maybe not done' });
    await alice.archiveCapture(capture.id);

    const restored = await alice.unarchiveCapture(capture.id);

    expect(restored.status).toBe('inbox');
    expect(restored.archivedAt).toBeUndefined();
  });

  it('can update capture content', async () => {
    const capture = await alice.createCapture({ content: 'Original' });

    const updated = await alice.updateCapture(capture.id, {
      content: 'Updated',
    });

    expect(updated.content).toBe('Updated');
  });

  it('can add a title to a capture', async () => {
    const capture = await alice.createCapture({ content: 'Some note' });

    const updated = await alice.updateCapture(capture.id, {
      title: 'Important!',
    });

    expect(updated.title).toBe('Important!');
  });

  it('returns not found for non-existent capture', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await expect(alice.getCapture(nonExistentId)).rejects.toThrow(NotFoundError);
  });

  it('returns not found when archiving non-existent capture', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await expect(alice.archiveCapture(nonExistentId)).rejects.toThrow(
      NotFoundError
    );
  });

  it('returns not found when updating non-existent capture', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await expect(
      alice.updateCapture(nonExistentId, { content: 'Updated' })
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects invalid capture id format', async () => {
    await expect(alice.getCapture('not-a-uuid')).rejects.toThrow(
      ValidationError
    );
  });

  it('rejects invalid id format when updating', async () => {
    await expect(
      alice.updateCapture('not-a-uuid', { content: 'test' })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects invalid id format when archiving', async () => {
    await expect(alice.archiveCapture('not-a-uuid')).rejects.toThrow(
      ValidationError
    );
  });
});
